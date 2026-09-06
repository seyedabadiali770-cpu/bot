package ir.starlive.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.KeyEvent;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

public class MainActivity extends Activity implements SensorEventListener {

    private WebView web;
    private FrameLayout root;
    private TextureView camView;
    private Camera camera;
    private int camFacing = 1;      /* 1 = جلو ، 0 = عقب */
    private String camMode = "full";
    private SensorManager sm;
    private Sensor accel;
    private volatile float ax = 0f, ay = 0f, az = 0f;
    private volatile float lastPressure = -1f, lastSize = -1f;
    private volatile double micLevel = -1;
    private AudioRecord recorder;
    private Thread micThread;
    private volatile boolean micRunning = false;
    private String pendingCall = null;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);

        root = new FrameLayout(this);
        setContentView(root);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setDefaultTextEncodingName("utf-8");
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= 17) {
            try { s.setMediaPlaybackRequiresUserGesture(false); } catch (Throwable t) { }
        }
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient());
        web.setBackgroundColor(0xFF0D0F16);
        web.addJavascriptInterface(new JsApi(), "Android");
        web.setLongClickable(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            public boolean onLongClick(View v) { return true; }
        });

        sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sm != null) accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        handleIntent(getIntent());
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        if (web != null && pendingCall != null) {
            final String pc = pendingCall;
            web.post(new Runnable() {
                public void run() {
                    String[] p = pc.split("\\|");
                    web.loadUrl("javascript:(function(){try{Calls.incoming('" + p[0] + "','"
                            + (p.length > 1 ? p[1] : "voice") + "','" + (p.length > 2 ? p[2].replace("'", " ") : "") + "');}catch(e){}})()");
                }
            });
            pendingCall = null;
        }
    }

    private void handleIntent(Intent i) {
        if (i == null) return;
        String pid = i.getStringExtra("pid");
        if (pid != null && pid.length() > 0) {
            String kind = i.getStringExtra("kind");
            String msg = i.getStringExtra("msg");
            pendingCall = pid + "|" + (kind == null ? "voice" : kind) + "|" + (msg == null ? "" : msg);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (sm != null && accel != null) sm.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (sm != null) sm.unregisterListener(this);
        releaseCamera();
    }

    @Override
    protected void onDestroy() {
        stopMicInternal();
        releaseCamera();
        super.onDestroy();
    }

    public void onSensorChanged(SensorEvent e) {
        ax = e.values[0]; ay = e.values[1]; az = e.values[2];
    }

    public void onAccuracyChanged(Sensor s, int a) { }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        try {
            lastPressure = ev.getPressure();
            lastSize = ev.getSize();
        } catch (Throwable t) { }
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (Build.VERSION.SDK_INT >= 19) {
                try {
                    web.evaluateJavascript("(function(){try{return window.handleBack()?'1':'0';}catch(e){return '0';}})()",
                            new ValueCallback<String>() {
                                public void onReceiveValue(String value) {
                                    if (value == null || value.indexOf('1') < 0) finish();
                                }
                            });
                    return true;
                } catch (Throwable t) { }
            }
            web.loadUrl("javascript:window.handleBack&&window.handleBack()");
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /* ---------------- میکروفون ---------------- */
    private void startMicInternal() {
        if (micRunning) return;
        try {
            int rate = 8000;
            int min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (min <= 0) min = 4096;
            recorder = new AudioRecord(MediaRecorder.AudioSource.MIC, rate,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, min * 2);
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) { recorder = null; return; }
            recorder.startRecording();
            micRunning = true;
            final int bufSize = min;
            micThread = new Thread(new Runnable() {
                public void run() {
                    short[] buf = new short[bufSize];
                    while (micRunning && recorder != null) {
                        int n = recorder.read(buf, 0, buf.length);
                        if (n > 0) {
                            double sum = 0;
                            for (int i = 0; i < n; i++) sum += (double) buf[i] * buf[i];
                            micLevel = Math.sqrt(sum / n) / 32768.0;
                        }
                    }
                }
            });
            micThread.start();
        } catch (Throwable t) {
            micRunning = false; micLevel = -1;
        }
    }

    private void stopMicInternal() {
        micRunning = false;
        try {
            if (recorder != null) {
                try { recorder.stop(); } catch (Throwable t) { }
                recorder.release();
            }
        } catch (Throwable t) { }
        recorder = null;
        micLevel = -1;
    }

    /* ---------------- دوربین ---------------- */
    private int findCamera(int facing) {
        try {
            int n = Camera.getNumberOfCameras();
            Camera.CameraInfo info = new Camera.CameraInfo();
            for (int i = 0; i < n; i++) {
                Camera.getCameraInfo(i, info);
                if ((facing == 1 && info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT)
                        || (facing == 0 && info.facing == Camera.CameraInfo.CAMERA_FACING_BACK)) return i;
            }
            return n > 0 ? 0 : -1;
        } catch (Throwable t) { return -1; }
    }

    private void setCamOrientation(int camId) {
        try {
            Camera.CameraInfo info = new Camera.CameraInfo();
            Camera.getCameraInfo(camId, info);
            int rotation = getWindowManager().getDefaultDisplay().getRotation();
            int degrees = 0;
            if (rotation == Surface.ROTATION_90) degrees = 90;
            else if (rotation == Surface.ROTATION_180) degrees = 180;
            else if (rotation == Surface.ROTATION_270) degrees = 270;
            int result;
            if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) {
                result = (info.orientation + degrees) % 360;
                result = (360 - result) % 360;
            } else {
                result = (info.orientation - degrees + 360) % 360;
            }
            camera.setDisplayOrientation(result);
        } catch (Throwable t) { }
    }

    private void openCameraOn(SurfaceTexture st) {
        try {
            int id = findCamera(camFacing);
            if (id < 0) return;
            camera = Camera.open(id);
            setCamOrientation(id);
            Camera.Parameters p = camera.getParameters();
            try {
                java.util.List<Camera.Size> sizes = p.getSupportedPreviewSizes();
                Camera.Size best = null;
                for (int i = 0; i < sizes.size(); i++) {
                    Camera.Size sz = sizes.get(i);
                    if (sz.width <= 800 && (best == null || sz.width > best.width)) best = sz;
                }
                if (best != null) p.setPreviewSize(best.width, best.height);
            } catch (Throwable t) { }
            try { camera.setParameters(p); } catch (Throwable t) { }
            camera.setPreviewTexture(st);
            camera.startPreview();
        } catch (Throwable t) {
            releaseCamera();
        }
    }

    private void releaseCamera() {
        try {
            if (camera != null) {
                camera.stopPreview();
                camera.release();
            }
        } catch (Throwable t) { }
        camera = null;
    }

    private void startCameraUi(final String facing, final String mode) {
        stopCameraUi();
        camFacing = "back".equals(facing) ? 0 : 1;
        camMode = mode == null ? "full" : mode;
        camView = new TextureView(MainActivity.this);
        FrameLayout.LayoutParams lp;
        if ("pip".equals(camMode)) {
            float d = getResources().getDisplayMetrics().density;
            lp = new FrameLayout.LayoutParams((int) (120 * d), (int) (160 * d));
            lp.gravity = Gravity.BOTTOM | Gravity.LEFT;
            lp.leftMargin = (int) (8 * d);
            lp.bottomMargin = (int) (62 * d);
            root.addView(camView, lp);                 /* روی وب‌ویو */
        } else {
            lp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT);
            root.addView(camView, 0, lp);              /* پشت وب‌ویو */
            web.setBackgroundColor(Color.TRANSPARENT);
        }
        camView.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            public void onSurfaceTextureAvailable(SurfaceTexture st, int w, int h) { openCameraOn(st); }
            public void onSurfaceTextureSizeChanged(SurfaceTexture st, int w, int h) { }
            public boolean onSurfaceTextureDestroyed(SurfaceTexture st) { releaseCamera(); return true; }
            public void onSurfaceTextureUpdated(SurfaceTexture st) { }
        });
    }

    private void stopCameraUi() {
        releaseCamera();
        try {
            if (camView != null) root.removeView(camView);
        } catch (Throwable t) { }
        camView = null;
        web.setBackgroundColor(0xFF0D0F16);
    }

    /* ---------------- رابط جاوااسکریپت ---------------- */
    public class JsApi {

        @JavascriptInterface
        public String sensors() {
            return ax + "," + ay + "," + az + "," + lastPressure + "," + lastSize + "," + micLevel;
        }

        @JavascriptInterface
        public void startMic() { startMicInternal(); }

        @JavascriptInterface
        public void stopMic() { stopMicInternal(); }

        @JavascriptInterface
        public String pendingCall() {
            String p = pendingCall;
            pendingCall = null;
            return p == null ? "" : p;
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.vibrate(ms);
            } catch (Throwable t) { }
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); }
            });
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                public void run() { finish(); }
            });
        }

        @JavascriptInterface
        public boolean hasCamera() {
            try { return Camera.getNumberOfCameras() > 0; } catch (Throwable t) { return false; }
        }

        @JavascriptInterface
        public void startCamera(final String facing, final String mode) {
            runOnUiThread(new Runnable() {
                public void run() { startCameraUi(facing, mode); }
            });
        }

        @JavascriptInterface
        public void stopCamera() {
            runOnUiThread(new Runnable() {
                public void run() { stopCameraUi(); }
            });
        }

        @JavascriptInterface
        public void switchCamera() {
            runOnUiThread(new Runnable() {
                public void run() { startCameraUi(camFacing == 1 ? "back" : "front", camMode); }
            });
        }

        @JavascriptInterface
        public String prefGet(String key) {
            try {
                return getSharedPreferences("starlive", Context.MODE_PRIVATE).getString(key, "");
            } catch (Throwable t) { return ""; }
        }

        @JavascriptInterface
        public void prefSet(String key, String value) {
            try {
                getSharedPreferences("starlive", Context.MODE_PRIVATE).edit().putString(key, value).commit();
            } catch (Throwable t) { }
        }

        @JavascriptInterface
        public void prefDel(String key) {
            try {
                getSharedPreferences("starlive", Context.MODE_PRIVATE).edit().remove(key).commit();
            } catch (Throwable t) { }
        }

        @JavascriptInterface
        public void prefClear() {
            try {
                getSharedPreferences("starlive", Context.MODE_PRIVATE).edit().clear().commit();
            } catch (Throwable t) { }
        }

        @JavascriptInterface
        public void scheduleCall(String id, String pid, String name, String atMillis, String kind, String msg) {
            try {
                long at = (long) Double.parseDouble(atMillis);
                Intent i = new Intent(MainActivity.this, CallReceiver.class);
                i.setAction("ir.starlive.app.CALL");
                i.putExtra("pid", pid);
                i.putExtra("name", name);
                i.putExtra("kind", kind);
                i.putExtra("msg", msg);
                i.putExtra("id", id);
                PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, id.hashCode(), i,
                        PendingIntent.FLAG_UPDATE_CURRENT);
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am == null) return;
                if (Build.VERSION.SDK_INT >= 23) {
                    try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); }
                    catch (Throwable t) { am.set(AlarmManager.RTC_WAKEUP, at, pi); }
                } else if (Build.VERSION.SDK_INT >= 19) {
                    am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
                } else {
                    am.set(AlarmManager.RTC_WAKEUP, at, pi);
                }
            } catch (Throwable t) { }
        }

        @JavascriptInterface
        public void cancelCall(String id) {
            try {
                Intent i = new Intent(MainActivity.this, CallReceiver.class);
                i.setAction("ir.starlive.app.CALL");
                PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, id.hashCode(), i,
                        PendingIntent.FLAG_UPDATE_CURRENT);
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null) am.cancel(pi);
            } catch (Throwable t) { }
        }
    }
}

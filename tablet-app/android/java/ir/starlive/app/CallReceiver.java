package ir.starlive.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.PowerManager;

public class CallReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String pid = intent.getStringExtra("pid");
        String name = intent.getStringExtra("name");
        String kind = intent.getStringExtra("kind");
        String msg = intent.getStringExtra("msg");
        if (name == null) name = "تماس ورودی";

        /* بیدار کردن صفحه */
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.FULL_WAKE_LOCK
                    | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "starlive:call");
            wl.acquire(15000);
        } catch (Throwable t) { }

        Intent open = new Intent(ctx, MainActivity.class);
        open.putExtra("pid", pid == null ? "cr7" : pid);
        open.putExtra("kind", kind == null ? "voice" : kind);
        open.putExtra("msg", msg == null ? "" : msg);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);

        PendingIntent pi = PendingIntent.getActivity(ctx, (int) System.currentTimeMillis(), open,
                PendingIntent.FLAG_UPDATE_CURRENT);

        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            String channel = "calls";
            if (Build.VERSION.SDK_INT >= 26) {
                try {
                    Class<?> c = Class.forName("android.app.NotificationChannel");
                    java.lang.reflect.Constructor<?> cons = c.getConstructor(String.class, CharSequence.class, int.class);
                    Object ch = cons.newInstance(channel, "تماس‌ها", 4);
                    NotificationManager.class.getMethod("createNotificationChannel", c).invoke(nm, ch);
                } catch (Throwable t) { }
            }

            Notification.Builder b = new Notification.Builder(ctx)
                    .setContentTitle("📞 " + name)
                    .setContentText("داره بهت زنگ می‌زنه...")
                    .setSmallIcon(android.R.drawable.sym_call_incoming)
                    .setAutoCancel(true)
                    .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
                    .setVibrate(new long[]{0, 700, 500, 700, 500})
                    .setContentIntent(pi);
            if (Build.VERSION.SDK_INT >= 16) {
                b.setPriority(Notification.PRIORITY_MAX);
                b.setFullScreenIntent(pi, true);
            }
            if (Build.VERSION.SDK_INT >= 26) {
                try { Notification.Builder.class.getMethod("setChannelId", String.class).invoke(b, channel); }
                catch (Throwable t) { }
            }
            Notification n;
            if (Build.VERSION.SDK_INT >= 16) n = b.build(); else n = b.getNotification();
            nm.notify(1001, n);
        } catch (Throwable t) { }

        /* باز کردن مستقیم برنامه روی صفحه تماس */
        try { ctx.startActivity(open); } catch (Throwable t) { }
    }
}

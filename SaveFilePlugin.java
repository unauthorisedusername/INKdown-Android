package com.inkdown.dj;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

  @PluginMethod
  public void saveAs(PluginCall call) {
    if (call.getString("path") == null) { call.reject("no path"); return; }
    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType(call.getString("mime", "application/octet-stream"));
    i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "file"));
    startActivityForResult(call, i, "saveResult");
  }

  @ActivityCallback
  private void saveResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
      call.reject("cancelled");
      return;
    }
    try {
      String p = Uri.parse(call.getString("path")).getPath();
      try (InputStream in = new FileInputStream(new File(p));
           OutputStream out = getContext().getContentResolver().openOutputStream(data.getData())) {
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
      }
      call.resolve();
    } catch (Exception e) {
      call.reject(String.valueOf(e.getMessage()));
    }
  }
}

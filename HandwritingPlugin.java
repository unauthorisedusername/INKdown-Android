package com.inkdown.dj;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.Ink;
import com.google.mlkit.vision.digitalink.RecognitionCandidate;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "Handwriting")
public class HandwritingPlugin extends Plugin {

  private DigitalInkRecognitionModel modelFor(String lang) throws Exception {
    DigitalInkRecognitionModelIdentifier id = DigitalInkRecognitionModelIdentifier.fromLanguageTag(lang);
    if (id == null) throw new Exception("Unsupported language: " + lang);
    return DigitalInkRecognitionModel.builder(id).build();
  }

  /** status({lang}) -> { downloaded: boolean } */
  @PluginMethod
  public void status(final PluginCall call) {
    try {
      String lang = call.getString("lang", "en-US");
      DigitalInkRecognitionModel model = modelFor(lang);
      RemoteModelManager.getInstance().isModelDownloaded(model)
        .addOnSuccessListener(ok -> {
          JSObject r = new JSObject();
          r.put("downloaded", ok != null && ok);
          call.resolve(r);
        })
        .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage())));
    } catch (Exception e) {
      call.reject(String.valueOf(e.getMessage()));
    }
  }

  /** recognize({strokes:[[{x,y,t}]], lang}) -> { candidates: [string] }; downloads the model first if needed */
  @PluginMethod
  public void recognize(final PluginCall call) {
    try {
      final String lang = call.getString("lang", "en-US");
      JSArray strokes = call.getArray("strokes");
      if (strokes == null || strokes.length() == 0) { call.reject("no strokes"); return; }

      Ink.Builder inkB = Ink.builder();
      for (int i = 0; i < strokes.length(); i++) {
        JSONArray pts = strokes.getJSONArray(i);
        Ink.Stroke.Builder sb = Ink.Stroke.builder();
        for (int j = 0; j < pts.length(); j++) {
          JSONObject p = pts.getJSONObject(j);
          sb.addPoint(Ink.Point.create((float) p.getDouble("x"), (float) p.getDouble("y"), (long) p.optDouble("t", 0)));
        }
        inkB.addStroke(sb.build());
      }
      final Ink ink = inkB.build();

      final DigitalInkRecognitionModel model = modelFor(lang);
      final RemoteModelManager mgr = RemoteModelManager.getInstance();

      mgr.isModelDownloaded(model)
        .addOnSuccessListener(downloaded -> {
          if (downloaded != null && downloaded) {
            runRecognition(call, model, ink);
          } else {
            mgr.download(model, new DownloadConditions.Builder().build())
              .addOnSuccessListener(v -> runRecognition(call, model, ink))
              .addOnFailureListener(e -> call.reject("Model download failed (check internet): " + e.getMessage()));
          }
        })
        .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage())));
    } catch (Exception e) {
      call.reject(String.valueOf(e.getMessage()));
    }
  }

  private void runRecognition(final PluginCall call, DigitalInkRecognitionModel model, Ink ink) {
    final DigitalInkRecognizer rec = DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(model).build());
    rec.recognize(ink)
      .addOnSuccessListener(result -> {
        JSArray arr = new JSArray();
        for (RecognitionCandidate c : result.getCandidates()) arr.put(c.getText());
        JSObject r = new JSObject();
        r.put("candidates", arr);
        rec.close();
        call.resolve(r);
      })
      .addOnFailureListener(e -> {
        rec.close();
        call.reject("Recognition failed: " + e.getMessage());
      });
  }
}

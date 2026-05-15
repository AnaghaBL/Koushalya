import base64
import io
import json
import os
import sys

from PIL import Image
import torch
from torchvision import models, transforms


EYE_CLASSES = [
    "Cataracts",
    "Conjunctivitis",
    "Crossed_Eyes",
    "Eyelid_Conditions",
    "Normal",
    "Uveitis",
]

DISPLAY_MAP = {
    "Cataracts": "Cataract / Lens haze cue",
    "Conjunctivitis": "Redness / Conjunctivitis",
    "Crossed_Eyes": "Needs doctor review",
    "Eyelid_Conditions": "Eyelid condition",
    "Normal": "Normal",
    "Uveitis": "Uveitis warning cue",
}


def load_image(data_url):
    raw = data_url.split(",", 1)[1] if "," in data_url else data_url
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


def load_model(model_path):
    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, len(EYE_CLASSES))
    model.load_state_dict(torch.load(model_path, map_location="cpu", weights_only=False))
    model.eval()
    return model


def predict(model, image):
    preprocess = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    tensor = preprocess(image).unsqueeze(0)
    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0].tolist()
    scores = {}
    for source_label, probability in zip(EYE_CLASSES, probs):
        label = DISPLAY_MAP[source_label]
        scores[label] = max(scores.get(label, 0), round(float(probability) * 100))
    top_label = max(scores, key=scores.get)
    return {"label": top_label, "confidence": scores[top_label], "scores": scores}


def main():
    try:
      payload = json.loads(sys.stdin.read() or "{}")
      model_path = payload.get("modelPath") or os.environ.get("EYE_MODEL_PATH")
      if not model_path:
          here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
          model_path = os.path.join(here, "models", "eye-screening", "eye_model_v2_best.pth")
      image = load_image(payload["imageData"])
      result = predict(load_model(model_path), image)
      print(json.dumps({"ok": True, **result}))
    except Exception as exc:
      print(json.dumps({"ok": False, "error": str(exc)}))
      sys.exit(1)


if __name__ == "__main__":
    main()

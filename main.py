from fastapi import FastAPI  # type: ignore[reportMissingImports]
import re
from pydantic import BaseModel, Field  # type: ignore[reportMissingImports]
from keras.models import load_model  # type: ignore[reportMissingImports]
import joblib
from keras.utils import pad_sequences
import pickle
from fastapi.responses import FileResponse  # type: ignore[reportMissingImports]
from fastapi.staticfiles import StaticFiles  # type: ignore[reportMissingImports]
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware  # type: ignore[reportMissingImports]
from fastapi import HTTPException  # type: ignore[reportMissingImports]

# we are going to make some constant like :
# 1. model path (BiGRU)
# 2. Tokenizer path (BiGRU)
# 3. max_sequences length
# 4. Emotion labels
# 5. Emotion emojis 

model_path = "BiGRU_model.keras"
tokenizer_path = "tokenizer.pkl"
max_sequence_length = 50
emotion_labels = ['sadness', 'joy', 'love', 'anger', 'fear', 'surprise']
emotion_emojis = {
    "sadness": "😢",
    "joy": "😄",
    "love": "❤️",
    "anger": "😡",
    "fear": "😨",
    "surprise": "😲"
}

# preprocess the upcoming text
#  cleans raw text so it matches the format used while training
# 1. convert text to lowercase
# 2. remove apostrophes, special characters, and extra spaces
def preprocess_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-zA-Z0-9\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# Requests and Responses Schemas
# 1. text input
# 2. prediction response
# 3. Health response(server health check)

class TextInput(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="The sentence to analyze for emotions",
        examples=["I am feeling very happy today!"],
    )

class PredictionResponse(BaseModel):
    text:str
    predicted_emotion: str
    confidence: float
    all_probabilities: dict[str,float]

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool

# Model loading and lifespan management
# 1. load the model and tokenizer when the application starts


dl_model = {}
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading model and tokenizer...")

    dl_model["BiGRU"] = load_model(model_path)
    with open(tokenizer_path, 'rb') as file:
       dl_model["tokenizer"] = pickle.load(file)
    print("Model and tokenizer loaded successfully.")

    yield  # pause, model is loaded and ready to serve requests

    dl_model.clear()  # clear the model and tokenizer when the application shuts down
    
# Mount the static files to the FastAPI app
# 1. Enable cors 


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,allow_origins=["*"],  # Allow all origins
    allow_credentials=True,allow_headers=["*"],allow_methods=["*"]
)


app.mount("/static", StaticFiles(directory="static"), name="static")


# API Endpoints
# 1. server UI at Homepage
# 2. health checked point 
# 3. predict endpoint for emotion prediction

@app.get("/",include_in_schema=False)
def server_ui():
    return FileResponse("static/index.html")


@app.get("/health",response_model=HealthResponse)
def health_check():
    return HealthResponse(status="ok", model_loaded=bool(dl_model))

# prediction endpoint for emotion prediction
@app.post("/predict", response_model=PredictionResponse)
def predict_emotion(text_input: TextInput):
    #1. cleans the input text
    # 2. convert the word into numerical representation using the tokenizer
    # 3. pad the sequence to ensure consistent input length
    # 4. Run prediction usingthe BiGRU model
    # 5. Get the predicted emotion, confidence score, and all probabilities for each emotion

    BiGRU_model = dl_model.get("BiGRU")
    tokenizer_model= dl_model.get("tokenizer")
    if BiGRU_model is None or tokenizer_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Please try again later.")

    cleaned_text = preprocess_text(text_input.text)

    tokenized_text = tokenizer_model.texts_to_sequences([cleaned_text])
    padded_sequence = pad_sequences(tokenized_text, maxlen=max_sequence_length,padding='post',
                                           truncating='post')

    probabilities = BiGRU_model.predict(padded_sequence)[0]
    top_emotion_index = probabilities.argmax()
    all_probabilities = {label:float(prob) for prob, label in zip( probabilities,emotion_labels)}

    return PredictionResponse(
        text=text_input.text,
        predicted_emotion=emotion_labels[top_emotion_index],
        confidence=float(probabilities[top_emotion_index]),
        all_probabilities=all_probabilities
    )


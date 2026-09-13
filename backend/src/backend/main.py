from fastapi import FastAPI

app = FastAPI(title="Job Application Command Center API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

"""NLP & NER extraction service combining spaCy with deterministic regex rules."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

try:
    import spacy
    try:
        nlp_model = spacy.load("en_core_web_sm")
    except Exception:
        nlp_model = None
except ImportError:
    spacy = None
    nlp_model = None

PHONE_REGEX = re.compile(r"(\+91\d{10}|\b\d{10}\b)")
VEHICLE_REGEX = re.compile(r"\b([A-Z]{2}\d{2}[A-Z]{2}\d{4})\b")
ACCOUNT_REGEX = re.compile(r"\b(ACC\d{3,6})\b")
DATE_REGEX = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")

def extract_entities_from_text(
    text: str, document_id: str
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Extracts entity mentions and relationships from free-form FIR or report text."""
    entities: List[Dict[str, Any]] = []
    seen_entities = set()

    # 1. Deterministic phone numbers
    for match in PHONE_REGEX.finditer(text):
        val = match.group(1)
        if not val.startswith("+91") and len(val) == 10:
            val = f"+91{val}"
        key = ("PHONE", val)
        if key not in seen_entities:
            seen_entities.add(key)
            entities.append({
                "type": "PHONE",
                "name": val,
                "value": val,
                "offsets": [match.start(), match.end()],
                "confidence": 1.0,
                "document_id": document_id,
            })

    # 2. Deterministic vehicles
    for match in VEHICLE_REGEX.finditer(text):
        val = match.group(1)
        key = ("VEHICLE", val)
        if key not in seen_entities:
            seen_entities.add(key)
            entities.append({
                "type": "VEHICLE",
                "name": val,
                "value": val,
                "offsets": [match.start(), match.end()],
                "confidence": 1.0,
                "document_id": document_id,
            })

    # 3. Deterministic accounts
    for match in ACCOUNT_REGEX.finditer(text):
        val = match.group(1)
        key = ("ACCOUNT", val)
        if key not in seen_entities:
            seen_entities.add(key)
            entities.append({
                "type": "ACCOUNT",
                "name": val,
                "value": val,
                "offsets": [match.start(), match.end()],
                "confidence": 1.0,
                "document_id": document_id,
            })

    # 4. spaCy NER for PERSON, ORG, GPE
    if nlp_model is not None:
        doc = nlp_model(text)
        for ent in doc.ents:
            etype = None
            if ent.label_ == "PERSON":
                etype = "PERSON"
            elif ent.label_ in ("ORG", "ORGANIZATION"):
                etype = "ORGANIZATION"
            elif ent.label_ in ("GPE", "LOC"):
                etype = "LOCATION"
            elif ent.label_ == "DATE":
                etype = "DATE"

            if etype:
                key = (etype, ent.text.strip())
                if key not in seen_entities and len(ent.text.strip()) > 1:
                    seen_entities.add(key)
                    entities.append({
                        "type": etype,
                        "name": ent.text.strip(),
                        "value": ent.text.strip(),
                        "offsets": [ent.start_char, ent.end_char],
                        "confidence": 0.88,
                        "document_id": document_id,
                    })

    # Fallback if spaCy model is not loaded: match common capitalized Person & Location names
    if nlp_model is None:
        for match in re.finditer(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b", text):
            name = match.group(1)
            key = ("PERSON", name)
            if key not in seen_entities:
                seen_entities.add(key)
                entities.append({
                    "type": "PERSON",
                    "name": name,
                    "value": name,
                    "offsets": [match.start(), match.end()],
                    "confidence": 0.75,
                    "document_id": document_id,
                })

    # Extract co-occurrence MENTIONED_IN relationships
    relationships: List[Dict[str, Any]] = []
    for ent in entities:
        relationships.append({
            "source_type": ent["type"],
            "source_name": ent["name"],
            "rel_type": "MENTIONED_IN",
            "target_type": "FIR",
            "target_name": document_id,
            "confidence": ent["confidence"],
            "method": "nlp_extraction",
            "document_id": document_id,
        })

    return entities, relationships

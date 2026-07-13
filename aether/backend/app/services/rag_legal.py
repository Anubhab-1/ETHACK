from __future__ import annotations
"""
AETHER — RAG Legal Advisory Service
Uses TF-IDF + Cosine Similarity over SQLite documents table for legal advisory.
Fully functional in offline/free tiers with zero dependencies except scikit-learn.
"""
import json
import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models import Document
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

SEED_DOCUMENTS = [
    {
        "title": "Section 31A of Air Act 1981 - Power to Direct Closure",
        "content": "Section 31A of the Air (Prevention and Control of Pollution) Act, 1981: Power to give directions. A Board may, in the exercise of its powers and performance of its functions under this Act, issue any directions in writing to any person, officer or authority, and such person, officer or authority shall be bound to comply with such directions. The power to issue directions under this section includes the power to direct: (a) the closure, prohibition or regulation of any industry, operation or process; or (b) the stoppage or regulation of supply of electricity, water or any other service.",
        "source": "Air_Act_1981_Section_31A",
        "doc_type": "legal"
    },
    {
        "title": "Section 21 of Air Act 1981 - Consent to Establish/Operate",
        "content": "Section 21 of the Air (Prevention and Control of Pollution) Act, 1981: Consent of State Board. No person shall, without the previous consent of the State Board, establish or operate any industrial plant in an air pollution control area. The State Board may grant consent subject to conditions such as installing specific control equipment, erecting chimneys of recommended heights, and maintaining emissions below CPCB limits.",
        "source": "Air_Act_1981_Section_21",
        "doc_type": "legal"
    },
    {
        "title": "Section 37 of Air Act 1981 - Penalties for Non-Compliance",
        "content": "Section 37 of the Air (Prevention and Control of Pollution) Act, 1981: Penalties for failure to comply with provisions of Section 21 or Section 22 or directions issued under Section 31A. Imprisonment for a term which shall not be less than one year and six months but which may extend to six years and with fine, and in case the failure continues, with an additional fine which may extend to five thousand rupees for every day during which such failure continues.",
        "source": "Air_Act_1981_Section_37",
        "doc_type": "legal"
    },
    {
        "title": "CPCB National Ambient Air Quality Standards (2009)",
        "content": "Central Pollution Control Board (CPCB) National Ambient Air Quality Standards (NAAQS) Notification (2009): Specifies limits for 12 pollutants. PM2.5: Annual average is 40 ug/m3, 24 Hours average is 60 ug/m3. PM10: Annual average is 60 ug/m3, 24 Hours average is 100 ug/m3. NO2: Annual average is 40 ug/m3, 24 Hours average is 80 ug/m3. SO2: Annual average is 50 ug/m3, 24 Hours average is 80 ug/m3. CO: 8 Hours average is 2 mg/m3, 1 Hour average is 4 mg/m3.",
        "source": "CPCB_NAAQS_2009",
        "doc_type": "standard"
    },
    {
        "title": "NGT Graded Response Action Plan (GRAP) Guidelines",
        "content": "Graded Response Action Plan (GRAP) specifies actions under four levels of air quality: (1) Stage I - 'Poor' (AQI 201-300): Strict enforcement of construction dust control, ban on open garbage burning, mechanical sweeping of roads. (2) Stage II - 'Very Poor' (AQI 301-400): Ban use of diesel generators except for emergency services, enhance parking fees, increase bus/metro frequency. (3) Stage III - 'Severe' (AQI 401-450): Halt all non-essential construction and demolition activities, stop brick kilns, restrict mining. (4) Stage IV - 'Severe+' (AQI >450): Stop entry of heavy trucks into city, halt all construction, permit offices to work from home.",
        "source": "NGT_GRAP_Directives",
        "doc_type": "directive"
    },
    {
        "title": "Solid Waste Management Rules 2016 - Garbage Burning Ban",
        "content": "Rule 15 of the Solid Waste Management Rules, 2016: Duties of local authorities and municipal bodies. Direct waste generators not to throw, burn or bury solid waste on streets, open public spaces, and strictly prohibit open burning of municipal solid waste, leaves, crop residue, and garden waste. Establish fine systems (spot fines) for open littering and burning.",
        "source": "SWM_Rules_2016_Rule_15",
        "doc_type": "legal"
    },
    {
        "title": "NGT Order on Construction Site Dust Control (2020)",
        "content": "National Green Tribunal (NGT) order on dust management at construction sites. Requires developers to erect windbreakers (tin sheets) around the boundary, use green netting for scaffolding, spray water continuously to settle dust, cover transport vehicles carrying sand/flyash/soil with tarpaulins, and install real-time PM10 dust monitors at large sites (>20,000 sqm). Failure triggers spot fines of Rs 50,000 to Rs 5,00,000.",
        "source": "NGT_Construction_Dust_Order_2020",
        "doc_type": "directive"
    }
]

def seed_documents_if_empty(db: Session):
    """Seed regulatory documents into the database if not already present."""
    try:
        count = db.query(Document).count()
        if count == 0:
            logger.info("RAG Corpus is empty — seeding regulatory documents...")
            for doc in SEED_DOCUMENTS:
                new_doc = Document(
                    title=doc["title"],
                    content=doc["content"],
                    source=doc["source"],
                    doc_type=doc["doc_type"],
                    embedding=None,
                    meta=json.dumps({"source": doc["source"]})
                )
                db.add(new_doc)
            db.commit()
            logger.info(f"Successfully seeded {len(SEED_DOCUMENTS)} regulatory documents.")
    except Exception as e:
        logger.error(f"Error seeding documents: {e}")
        if db is not None:
            db.rollback()

def query_legal(question: str, db: Session, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Search regulatory corpus using TF-IDF + Cosine Similarity.
    Auto-seeds documents if database is empty.
    """
    # Ensure database is seeded
    seed_documents_if_empty(db)
    
    try:
        docs = db.query(Document).all()
        if not docs:
            return []
            
        corpus = [d.content for d in docs]
        vectorizer = TfidfVectorizer(stop_words='english')
        tfidf_matrix = vectorizer.fit_transform(corpus)
        
        query_vec = vectorizer.transform([question])
        similarities = cosine_similarity(query_vec, tfidf_matrix).flatten()
        
        # Rank and filter top matches
        results = []
        top_indices = similarities.argsort()[::-1][:limit]
        
        for idx in top_indices:
            score = float(similarities[idx])
            if score > 0.05:  # Relevance threshold
                doc = docs[idx]
                results.append({
                    "id": doc.id,
                    "title": doc.title,
                    "content": doc.content,
                    "source": doc.source,
                    "doc_type": doc.doc_type,
                    "similarity_score": round(score, 3)
                })
        return results
    except Exception as e:
        logger.error(f"Error executing RAG legal query: {e}")
        return []

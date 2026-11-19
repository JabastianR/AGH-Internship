
import os
import json
import hashlib
from pathlib import Path

from dotenv import load_dotenv
from pypdf import PdfReader

from langchain_groq import ChatGroq
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import FileChatMessageHistory
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings


# ==================================================
# 1. CONFIGURATION
# ==================================================

load_dotenv()

API_KEY = os.getenv("GROQ_API_KEY")

if not API_KEY:
    raise ValueError("Groq API key not found. Check your .env file.")

BASE_DIR = Path(__file__).resolve().parent

DOCUMENT_DIR = BASE_DIR / "documents"
HISTORY_DIR = BASE_DIR / "chat_history"
VECTOR_STORE_DIR = BASE_DIR / "vector_store"

DOCUMENT_DIR.mkdir(exist_ok=True)
HISTORY_DIR.mkdir(exist_ok=True)

HISTORY_FILE = HISTORY_DIR / "conversation.json"
MANIFEST_FILE = VECTOR_STORE_DIR / "manifest.json"

MODEL_NAME = "openai/gpt-oss-20b"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

SESSION_ID = "terminal-user"
TOP_K = 4
selected_document = None
CHUNK_SIZE = 800
CHUNK_OVERLAP = 120

vector_store = None
document_chunks = []
embeddings = None


# ==================================================
# 2. GROQ MODEL
# ==================================================

llm = ChatGroq(
    model=MODEL_NAME,
    api_key=API_KEY,
    temperature=0.7,
    max_tokens=1024,
    reasoning_format="hidden",
    max_retries=2,
    timeout=60
)


# ==================================================
# 3. HUGGING FACE EMBEDDINGS
# ==================================================

def get_embeddings():

    global embeddings

    if embeddings is None:

        print("\nLoading embedding model...")

        embeddings = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True}
        )

        print("Embedding model loaded successfully.")

    return embeddings


# ==================================================
# 4. DOCUMENT LOADING
# ==================================================

def load_documents():

    documents = []

    print("\nLoading documents...")

    files = sorted(
        list(DOCUMENT_DIR.glob("*.pdf"))
        + list(DOCUMENT_DIR.glob("*.txt"))
    )

    if not files:
        print("No PDF or TXT documents found.")
        return documents

    for file_path in files:

        try:

            print(f"Reading: {file_path.name}")

            if file_path.suffix.lower() == ".pdf":

                reader = PdfReader(str(file_path))

                if reader.is_encrypted:
                    print(f"Skipping encrypted PDF: {file_path.name}")
                    continue

                for page_number, page in enumerate(
                    reader.pages, start=1
                ):

                    text = page.extract_text() or ""

                    if text.strip():

                        documents.append(
                            Document(
                                page_content=text,
                                metadata={
                                    "source": file_path.name,
                                    "page": page_number
                                }
                            )
                        )

            elif file_path.suffix.lower() == ".txt":

                text = file_path.read_text(
                    encoding="utf-8",
                    errors="replace"
                )

                if text.strip():

                    documents.append(
                        Document(
                            page_content=text,
                            metadata={
                                "source": file_path.name,
                                "page": 1
                            }
                        )
                    )

        except Exception as error:

            print(f"Could not read {file_path.name}: {error}")

    return documents


# ==================================================
# 5. TEXT CHUNKING
# ==================================================

def split_documents(documents):

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        add_start_index=True
    )

    return splitter.split_documents(documents)


# ==================================================
# 6. DOCUMENT FINGERPRINT
# ==================================================

def get_document_manifest():

    files = sorted(
        list(DOCUMENT_DIR.glob("*.pdf"))
        + list(DOCUMENT_DIR.glob("*.txt"))
    )

    file_data = []

    for file_path in files:

        file_hash = hashlib.sha256(
            file_path.read_bytes()
        ).hexdigest()

        file_data.append({
            "name": file_path.name,
            "sha256": file_hash
        })

    return {
        "embedding_model": EMBEDDING_MODEL,
        "chunk_size": CHUNK_SIZE,
        "chunk_overlap": CHUNK_OVERLAP,
        "files": file_data
    }


# ==================================================
# 7. BUILD OR LOAD FAISS VECTOR DATABASE
# ==================================================

def rebuild_index(force=False):

    global vector_store, document_chunks

    VECTOR_STORE_DIR.mkdir(exist_ok=True)

    current_manifest = get_document_manifest()

    index_file = VECTOR_STORE_DIR / "index.faiss"
    pickle_file = VECTOR_STORE_DIR / "index.pkl"

    if not current_manifest["files"]:

        vector_store = None
        document_chunks = []

        print("\nNo documents available for indexing.")
        return

    # Check whether an existing index can be reused
    if (
        not force
        and index_file.exists()
        and pickle_file.exists()
        and MANIFEST_FILE.exists()
    ):

        try:

            saved_manifest = json.loads(
                MANIFEST_FILE.read_text(encoding="utf-8")
            )

            if saved_manifest == current_manifest:

                print("\nLoading existing FAISS vector database...")
                documents = load_documents()
                document_chunks = split_documents(documents)

                vector_store = FAISS.load_local(
                    str(VECTOR_STORE_DIR),
                    get_embeddings(),
                    allow_dangerous_deserialization=True
                )

                print("Existing FAISS database loaded successfully.")
                return

        except Exception as error:

            print(f"Could not load saved index: {error}")
            print("Creating a fresh index...")

    # Read and split documents
    documents = load_documents()

    document_chunks = split_documents(documents)

    if not document_chunks:

        vector_store = None

        print("\nNo readable document content found.")
        return

    # Create embeddings and FAISS index
    print("\nGenerating document embeddings...")
    print("This may take some time on your CPU.")

    vector_store = FAISS.from_documents(
        documents=document_chunks,
        embedding=get_embeddings()
    )

    # Save index locally
    vector_store.save_local(str(VECTOR_STORE_DIR))

    # Save document fingerprint
    MANIFEST_FILE.write_text(
        json.dumps(current_manifest, indent=4),
        encoding="utf-8"
    )

    print("\n" + "=" * 50)
    print("FAISS VECTOR DATABASE CREATED SUCCESSFULLY")
    print("=" * 50)

    print(f"Documents loaded : {len(documents)}")
    print(f"Text chunks      : {len(document_chunks)}")
    print(f"Embedding model  : {EMBEDDING_MODEL}")
    print("Retrieval method : FAISS Semantic Search")
    print("Storage          : Local")
    print("=" * 50)


# ==================================================
# 8. RETRIEVE RELEVANT DOCUMENT CONTENT
# ==================================================

def retrieve_context(question):

    if vector_store is None:
        return "No documents have been indexed.", []

    # General search across all documents
    if selected_document is None:

        results = vector_store.similarity_search(
            question,
            k=TOP_K
        )

    # Search only the selected document
    else:

        results = vector_store.similarity_search(
            question,
            k=TOP_K,
            filter={"source": selected_document}
        )

    if not results:
        return (
            "No relevant passages were found.",
            []
        )

    context_parts = []
    sources = []

    for chunk in results:

        source = chunk.metadata.get("source", "Unknown")
        page = chunk.metadata.get("page", "Unknown")

        context_parts.append(
            f"""
Source: {source}
Page: {page}

Content:
{chunk.page_content}
"""
        )

        source_info = (source, page)

        if source_info not in sources:
            sources.append(source_info)

    context = "\n\n".join(context_parts)

    return context, sources


# ==================================================
# 9. AI SYSTEM PROMPT
# ==================================================

system_prompt = """
You are an intelligent AI assistant with RAG capabilities.

You have access to information retrieved from user documents.

Instructions:

1. Answer questions clearly and accurately.
2. Use retrieved document information when relevant.
3. Do not invent document content or citations.
4. If the documents do not contain the answer,
   clearly say that the information was not found.
5. You may provide general knowledge when useful,
   but clearly distinguish it from document-based answers.
6. Remember previous conversation messages.
7. Explain technical topics in simple language.
8. Never claim that you read a document that was not loaded.

The retrieved document context is provided below:

{context}
"""


# ==================================================
# 10. CREATE LANGCHAIN PROMPT
# ==================================================

prompt = ChatPromptTemplate.from_messages([

    ("system", system_prompt),

    MessagesPlaceholder(variable_name="history"),

    ("human", "{question}")

])


# ==================================================
# 11. CREATE AI CHAIN
# ==================================================

chain = prompt | llm


# ==================================================
# 12. PERSISTENT CHAT HISTORY
# ==================================================

def get_session_history(session_id):

    return FileChatMessageHistory(
        file_path=str(HISTORY_FILE)
    )


chatbot = RunnableWithMessageHistory(
    chain,
    get_session_history,
    input_messages_key="question",
    history_messages_key="history"
)


# ==================================================
# 13. DISPLAY DOCUMENTS
# ==================================================

def show_documents():
    def list_documents():

     files = sorted(
        list(DOCUMENT_DIR.glob("*.pdf"))
        + list(DOCUMENT_DIR.glob("*.txt"))
    )

    if not files:
        print("\nNo documents found.")
        return

    print("\n========== AVAILABLE DOCUMENTS ==========")

    for index, file_path in enumerate(files, start=1):
        print(f"{index}. {file_path.name}")

    print("=========================================")

    if not document_chunks:

        print("\nNo documents are currently indexed.")
        return

    sources = sorted({
        chunk.metadata.get("source", "Unknown")
        for chunk in document_chunks
    })

    print("\n========== INDEXED DOCUMENTS ==========")

    for index, source in enumerate(sources, start=1):

        print(f"{index}. {source}")

    print(f"\nTotal documents: {len(sources)}")
    print(f"Total chunks: {len(document_chunks)}")

    print("=======================================")


# ==================================================
# 14. MAIN CHATBOT
# ==================================================

def start_chatbot():

    global selected_document

    rebuild_index()

    print("\n" + "=" * 55)
    print("             GROQ RAG AI CHATBOT")
    print("=" * 55)

    print(f"AI Model     : {MODEL_NAME}")
    print("Framework    : LangChain")
    print("RAG          : Enabled")
    print("Retrieval    : FAISS Semantic Search")
    print(f"Embeddings   : {EMBEDDING_MODEL}")
    print("Memory       : Persistent JSON")
    print("Vector DB    : Local FAISS")

    print("\nAvailable Commands:")
    print("  exit   - Close chatbot")
    print("  clear  - Clear chat history")
    print("  history - Display chat history")
    print("  docs   - Display indexed documents")
    print("  reload - Reload documents and rebuild index")

    print("=" * 55)
    print("\nChatbot is ready!")

    while True:

        try:

            user_input = input("\nYou: ").strip()

            if not user_input:
                continue

            command = user_input.lower()

            # EXIT
            if command == "exit":

                print("\nBot: Goodbye! Have a great day!")
                break

            # CLEAR HISTORY
            elif command == "clear":

                history = get_session_history(SESSION_ID)
                history.clear()

                print("\nBot: Conversation history cleared.")
                continue

            # DISPLAY HISTORY
            elif command == "history":

                history = get_session_history(SESSION_ID)

                print("\n========== CHAT HISTORY ==========")

                if not history.messages:
                    print("No conversation history found.")

                for message in history.messages:

                    if message.type == "human":
                        print(f"\nYou: {message.content}")

                    elif message.type == "ai":
                        print(f"\nBot: {message.content}")

                print("\n==================================")
                continue

            # DISPLAY DOCUMENTS
            elif command == "docs":

                show_documents()
                continue
            
            # LIST AVAILABLE DOCUMENTS
            elif command == "list":

                list_documents()
                continue

            # SELECT A DOCUMENT
            elif command.startswith("use "):

                files = sorted(
                    list(DOCUMENT_DIR.glob("*.pdf"))
                    + list(DOCUMENT_DIR.glob("*.txt"))
                )

                selection = user_input[4:].strip()

                if selection.lower() == "all":

                    selected_document = None
                    print("\nBot: General mode enabled. Searching all documents.")

                else:

                    try:
                        index = int(selection) - 1

                        if 0 <= index < len(files):
                            selected_document = files[index].name

                            print(
                                f"\nBot: Selected document: {selected_document}"
                            )

                        else:
                            print("\nBot: Invalid document number.")

                    except ValueError:
                        print("\nBot: Enter a valid number or use 'all'.")

                continue


            # RELOAD DOCUMENTS
            elif command == "reload":

                rebuild_index(force=True)

                print("\nBot: Document index refreshed.")
                continue

            # RETRIEVE DOCUMENT CONTEXT
            context, sources = retrieve_context(user_input)

            print("\nBot: ", end="", flush=True)

            # GENERATE STREAMING RESPONSE
            response_stream = chatbot.stream(
                {
                    "question": user_input,
                    "context": context
                },
                config={
                    "configurable": {
                        "session_id": SESSION_ID
                    }
                }
            )

            for chunk in response_stream:

                content = chunk.content

                if isinstance(content, str):

                    print(content, end="", flush=True)

                elif isinstance(content, list):

                    for item in content:

                        if isinstance(item, dict):

                            text = item.get("text", "")

                            if text:
                                print(text, end="", flush=True)

            print()

            # DISPLAY SOURCES
            if sources:

                print("\nSources used:")

                for source, page in sources:

                    print(f"  - {source} (Page {page})")

            else:

                print("\nSources used: No relevant document passages.")

        except KeyboardInterrupt:

            print("\n\nBot: Chat interrupted. Goodbye!")
            break

        except Exception as error:

            print(f"\n\nError: {error}")
            print("Please check your connection and try again.")


# ==================================================
# 15. RUN APPLICATION
# ==================================================

if __name__ == "__main__":

    start_chatbot()
    print("  list   - List available documents")
    print("  use N  - Select document number N (use all to reset)")

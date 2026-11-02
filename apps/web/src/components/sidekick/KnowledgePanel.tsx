"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { validateKnowledgeInput, type KnowledgeKind } from "@lockstep/shared";
import {
  addKnowledge,
  getKnowledge,
  readContextFile,
  type KnowledgeDocument,
  type KnowledgeDocumentSummary,
} from "../../lib/sidekickClient";
import { SidePanel, Icon } from "./Primitives";
import { CodeView } from "./RichText";
interface Props {
  documents: KnowledgeDocumentSummary[];
  selectedIds: string[];
  busy: boolean;
  onSelect: (ids: string[]) => Promise<void>;
  onAdded: (doc: KnowledgeDocumentSummary) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}
export function KnowledgePanel({
  documents,
  selectedIds,
  busy,
  onSelect,
  onAdded,
  onDelete,
  onClose,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<KnowledgeKind>("document");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<KnowledgeDocument | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fail = (cause: unknown) =>
    setError(
      cause instanceof Error ? cause.message : "The context request did not finish. Try again.",
    );
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const input = validateKnowledgeInput({ schemaVersion: 1, title, content, kind });
      const document = await addKnowledge(input);
      await onAdded(document);
      setEditing(false);
      setTitle("");
      setContent("");
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const text = await readContextFile(file);
      const document = await addKnowledge({
        title: file.name,
        content: text,
        kind: /\.(log|txt)$/i.test(file.name)
          ? "log"
          : /\.(md|json|ya?ml|toml|csv)$/i.test(file.name)
            ? "document"
            : "code",
      });
      await onAdded(document);
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  };
  const toggle = async (id: string) => {
    setPending(true);
    setError(null);
    try {
      await onSelect(
        selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id],
      );
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  };
  return (
    <SidePanel title="Your context" eyebrow="PRIVATE KNOWLEDGE LIBRARY" onClose={onClose}>
      <p className="ls-panel-lede">
        Bring the code, docs, and runbooks that make this incident yours. Pin up to 12 sources to
        always include in this thread. Other saved knowledge can be retrieved when relevant.
      </p>
      <div className="ls-knowledge-actions">
        <button
          type="button"
          className="ls-button ls-button-primary"
          disabled={pending || busy}
          onClick={() => {
            setEditing(!editing);
            setPreview(null);
          }}
        >
          <Icon name="plus" />
          Paste context
        </button>
        <button
          type="button"
          className="ls-button ls-button-outline"
          disabled={pending || busy}
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="attach" />
          Upload file
        </button>
        <input
          className="ls-sr-only"
          ref={fileRef}
          type="file"
          aria-label="Upload context file"
          accept=".txt,.md,.log,.json,.sql,.py,.js,.ts,.tsx,.jsx,.rs,.java,.yaml,.yml,.toml,.csv,.go,.rb,.sh,.css,.html,.xml"
          onChange={(event) => void upload(event)}
        />
      </div>
      <p className="ls-muted ls-file-note">
        UTF-8 text, code, or logs · up to 32 KB. Remove secrets before uploading.
      </p>
      {error ? (
        <div role="alert" className="ls-alert">
          {error}
        </div>
      ) : null}
      {pending ? (
        <p role="status" className="ls-inline-status">
          <span className="ls-spinner" />
          Saving your context…
        </p>
      ) : null}
      {editing ? (
        <form
          className="ls-context-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor="context-title">Title</label>
          <input
            id="context-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            placeholder="For example: checkout service runbook"
            required
          />
          <label htmlFor="context-kind">Source type</label>
          <select
            id="context-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as KnowledgeKind)}
          >
            {["document", "code", "log", "note"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <label htmlFor="context-content">Content</label>
          <textarea
            id="context-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={9}
            placeholder="Paste source material here…"
            required
          />
          <div className="ls-form-footer">
            <span>{content.length.toLocaleString()} / 32,768 characters</span>
            <button
              type="submit"
              className="ls-button ls-button-primary"
              disabled={pending || busy}
            >
              Save context
            </button>
          </div>
        </form>
      ) : null}
      <div className="ls-library-heading">
        <h3>
          Saved sources <span>{documents.length}</span>
        </h3>
        <span>{selectedIds.length} pinned</span>
      </div>
      {documents.length > 0 ? (
        <label className="ls-search">
          <Icon name="search" />
          <input
            aria-label="Search your context"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a source…"
          />
        </label>
      ) : null}
      {documents.length === 0 && !editing ? (
        <div className="ls-panel-empty">
          <Icon name="book" size={32} />
          <h3>Context changes the conversation.</h3>
          <p>
            Save a relevant runbook or code excerpt. It remains private to this browser’s access
            key.
          </p>
        </div>
      ) : (
        <div className="ls-library">
          {documents
            .filter((doc) => doc.title.toLowerCase().includes(query.toLowerCase()))
            .map((doc) => (
              <article key={doc.id} className="ls-library-item">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(doc.id)}
                    disabled={busy || pending}
                    onChange={() => void toggle(doc.id)}
                    aria-label={`Pin ${doc.title}`}
                  />
                  <span>
                    <strong>{doc.title}</strong>
                    <small>
                      {doc.kind} · {doc.charCount.toLocaleString()} characters ·{" "}
                      {doc.indexStatus === "semantic" ? "semantic + keyword" : "keyword index"}
                    </small>
                  </span>
                </label>
                <div className="ls-library-controls">
                  <button
                    type="button"
                    className="ls-text-button"
                    onClick={() => {
                      setError(null);
                      void getKnowledge(doc.id).then(setPreview).catch(fail);
                    }}
                  >
                    Preview
                  </button>
                  {removeId === doc.id ? (
                    <>
                      <span>Delete?</span>
                      <button
                        type="button"
                        className="ls-text-button ls-danger"
                        disabled={pending || busy}
                        onClick={() => {
                          setPending(true);
                          void onDelete(doc.id)
                            .then(() => {
                              setRemoveId(null);
                              if (preview?.id === doc.id) setPreview(null);
                            })
                            .catch(fail)
                            .finally(() => setPending(false));
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="ls-text-button"
                        onClick={() => setRemoveId(null)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="ls-icon-button"
                      aria-label={`Delete ${doc.title}`}
                      disabled={busy || pending}
                      onClick={() => setRemoveId(doc.id)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </article>
            ))}
        </div>
      )}
      {preview ? (
        <section className="ls-context-preview">
          <h3>{preview.title}</h3>
          <CodeView code={preview.content} label="Saved source content" />
        </section>
      ) : null}
      <p className="ls-panel-footnote">
        Selected source material is sent to the investigation service and, when configured, the
        model provider. Context is untrusted evidence, never executable instructions.
      </p>
    </SidePanel>
  );
}

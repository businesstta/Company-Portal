import { useEffect, useRef } from "react";
import { sanitizeRichText } from "./rich-text";

const MAX_DESCRIPTION_LENGTH = 100000;
const cleanControlCharacters = (text: string) => [...text].filter(character => {
  const code = character.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
}).join("");

export default function RichTextEditor({ name, initialValue = "", placeholder = "Describe this learning content…" }: { name: string; initialValue?: string; placeholder?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const errorRef = useRef<HTMLElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const lastValidValueRef = useRef("");

  useEffect(() => {
    const sanitized = sanitizeRichText(initialValue);
    lastValidValueRef.current = sanitized;
    if (editorRef.current) editorRef.current.innerHTML = sanitized;
    if (inputRef.current) inputRef.current.value = sanitized;
    if (counterRef.current) counterRef.current.textContent = `${(editorRef.current?.innerText.length ?? 0).toLocaleString()}/100,000`;
  }, [initialValue]);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) selectionRef.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    const selection = window.getSelection();
    if (!selectionRef.current || !selection) return false;
    selection.removeAllRanges();
    selection.addRange(selectionRef.current);
    return true;
  };
  const showError = (message = "") => {
    if (!errorRef.current) return;
    errorRef.current.textContent = message;
    errorRef.current.classList.toggle("error", Boolean(message));
  };
  const sync = () => {
    if (!editorRef.current || !inputRef.current) return;
    const nextCount = editorRef.current.innerText.length;
    if (nextCount > MAX_DESCRIPTION_LENGTH) {
      editorRef.current.innerHTML = lastValidValueRef.current;
      showError("Description cannot exceed 100,000 characters.");
    } else {
      showError();
      lastValidValueRef.current = editorRef.current.innerHTML;
      inputRef.current.value = lastValidValueRef.current;
    }
    if (counterRef.current) counterRef.current.textContent = `${editorRef.current.innerText.length.toLocaleString()}/100,000`;
  };
  const pastePlainText = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = cleanControlCharacters(event.clipboardData.getData("text/plain"));
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    selectionRef.current = range.cloneRange();
    sync();
  };
  const command = (commandName: string, commandValue?: string) => {
    if (!restoreSelection()) editorRef.current?.focus();
    document.execCommand(commandName, false, commandValue);
    sync();
    rememberSelection();
  };

  return <div className="lms-rich-editor">
    <div className="lms-rich-toolbar" role="toolbar" aria-label="Description formatting">
      <button type="button" title="Bold" onMouseDown={event => { event.preventDefault(); command("bold"); }}><b>B</b></button>
      <button type="button" title="Italic" onMouseDown={event => { event.preventDefault(); command("italic"); }}><i>I</i></button>
      <button type="button" title="Underline" onMouseDown={event => { event.preventDefault(); command("underline"); }}><u>U</u></button>
      <select aria-label="Font size" defaultValue="3" onMouseDown={rememberSelection} onChange={event => command("fontSize", event.target.value)}><option value="2">10</option><option value="3">12</option><option value="4">14</option><option value="5">18</option><option value="6">24</option></select>
      <div className="lms-color-control" title="Font color"><span>A</span><input type="color" aria-label="Font color" defaultValue="#071b4f" onMouseDown={rememberSelection} onChange={event => command("foreColor", event.target.value)} /></div>
    </div>
    <div ref={editorRef} className="lms-rich-input" contentEditable suppressContentEditableWarning data-placeholder={placeholder} onInput={sync} onPaste={pastePlainText} onMouseUp={rememberSelection} onKeyUp={rememberSelection} />
    <input ref={inputRef} type="hidden" name={name} defaultValue="" />
    <div className="lms-rich-meta"><small ref={errorRef}></small><span ref={counterRef}>0/100,000</span></div>
  </div>;
}

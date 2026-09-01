import { useEffect, useRef, useState } from "react";
import { sanitizeRichText } from "./rich-text";

const MAX_DESCRIPTION_LENGTH = 100000;

export default function RichTextEditor({ name, initialValue = "", placeholder = "Describe this learning content…" }: { name: string; initialValue?: string; placeholder?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const [value, setValue] = useState("");
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const sanitized = sanitizeRichText(initialValue);
    setValue(sanitized);
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitized;
      setCount(editorRef.current.innerText.length);
    }
  }, [initialValue]);
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) selectionRef.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    const selection = window.getSelection();
    if (!selectionRef.current || !selection) return;
    selection.removeAllRanges();
    selection.addRange(selectionRef.current);
  };
  const sync = () => {
    if (!editorRef.current) return;
    const nextCount = editorRef.current.innerText.length;
    setCount(nextCount);
    setError(nextCount > MAX_DESCRIPTION_LENGTH ? "Description cannot exceed 100,000 characters." : "");
    valueRef.current?.setCustomValidity(nextCount > MAX_DESCRIPTION_LENGTH ? "Description cannot exceed 100,000 characters." : "");
    setValue(editorRef.current.innerHTML);
  };
  const command = (commandName: string, commandValue?: string) => {
    restoreSelection();
    document.execCommand(commandName, false, commandValue);
    editorRef.current?.focus();
    sync();
    rememberSelection();
  };
  return <div className="lms-rich-editor">
    <div className="lms-rich-toolbar" role="toolbar" aria-label="Description formatting">
      <button type="button" title="Bold" onMouseDown={event => { event.preventDefault(); command("bold"); }}><b>B</b></button>
      <button type="button" title="Italic" onMouseDown={event => { event.preventDefault(); command("italic"); }}><i>I</i></button>
      <button type="button" title="Underline" onMouseDown={event => { event.preventDefault(); command("underline"); }}><u>U</u></button>
      <select aria-label="Font size" defaultValue="3" onMouseDown={rememberSelection} onChange={event => command("fontSize", event.target.value)}><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Extra large</option></select>
      <label title="Font color"><span>A</span><input type="color" aria-label="Font color" defaultValue="#071b4f" onMouseDown={rememberSelection} onChange={event => command("foreColor", event.target.value)} /></label>
    </div>
    <div ref={editorRef} className="lms-rich-input" contentEditable suppressContentEditableWarning data-placeholder={placeholder} onInput={sync} onMouseUp={rememberSelection} onKeyUp={rememberSelection} />
    <input ref={valueRef} className="lms-rich-value" name={name} value={value} readOnly aria-label="Formatted description value" />
    <div className="lms-rich-meta"><small className={error ? "error" : ""}>{error}</small><span>{count.toLocaleString()}/100,000</span></div>
  </div>;
}

import { useLayoutEffect, useRef, useState } from 'react';
import { clampEditorFraction, editorFractionAt } from '../services/editorLayout';
import { useDragResize } from './useDragResize';

export function useEditorResize(requested: number, explorerOpen: boolean, onChange: (fraction: number) => void) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState({ workspace: 0, explorer: 0 });
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    const editor = editorRef.current;
    if (!workspace || !editor) return;
    const measure = () => {
      const bounds = workspace.getBoundingClientRect();
      setSizes({ workspace: bounds.width, explorer: editor.getBoundingClientRect().left - bounds.left });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [explorerOpen]);
  const fraction = clampEditorFraction(requested, sizes.workspace, sizes.explorer);
  const setFraction = (next: number) => onChange(clampEditorFraction(next, sizes.workspace, sizes.explorer));
  const startResize = useDragResize((event) => {
    const workspace = workspaceRef.current?.getBoundingClientRect();
    const editor = editorRef.current?.getBoundingClientRect();
    if (!workspace || !editor) return;
    const next = editorFractionAt(event.clientX, editor.left, workspace.width);
    onChange(clampEditorFraction(next, workspace.width, editor.left - workspace.left));
  });
  const maxFraction = clampEditorFraction(0.75, sizes.workspace, sizes.explorer);
  return { workspaceRef, editorRef, fraction, maxFraction, setFraction, startResize };
}

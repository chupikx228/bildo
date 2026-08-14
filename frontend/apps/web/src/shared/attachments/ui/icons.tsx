import type { Attachment } from "../model";

export function AttachIcon({ kind }: { kind: Attachment["kind"] }) {
  if (kind === "image") {
    return (
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="2" y="3" width="10" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M2.6 9.4l2.6-2.3 2.1 1.8 1.8-1.4 2.3 2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.6 2.5h4L11 5.7v5.8H3.6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M7.5 2.7v3h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function ImageMenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="3" width="10" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2.6 9.4l2.6-2.3 2.1 1.8 1.8-1.4 2.3 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="5.4" cy="5.6" r=".9" fill="currentColor" />
    </svg>
  );
}

export function FileMenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.6 2.5h4L11 5.7v5.8H3.6z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M7.5 2.7v3h3.2" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

export function ClipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.4 7.1L7.2 11.3a2.1 2.1 0 01-3-3l4.6-4.6a1.4 1.4 0 012 2l-4.6 4.6a.7.7 0 01-1-1l4.2-4.2"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

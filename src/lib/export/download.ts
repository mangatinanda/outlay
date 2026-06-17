/** Trigger a browser download for a Blob with a chosen filename. Browser-only. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so the click has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

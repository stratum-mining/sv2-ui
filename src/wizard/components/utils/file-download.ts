// Helper function to download a file

export const downloadFile = (content: string, filename: string) => {
  // For docker_env, use application/octet-stream to prevent browsers from adding .txt extension
  const mimeType = filename === 'docker_env'
    ? 'application/octet-stream'
    : 'text/plain';

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);

  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

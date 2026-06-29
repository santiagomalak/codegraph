export async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashFile(file) {
  const content = await file.text();
  return hashContent(content);
}

export async function computeProjectHash(files) {
  const hashes = await Promise.all(
    Array.from(files).map(async file => {
      const content = await file.text();
      const hash = await hashContent(content);
      return `${file.webkitRelativePath}:${hash}`;
    })
  );
  hashes.sort();
  return hashContent(hashes.join('|'));
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

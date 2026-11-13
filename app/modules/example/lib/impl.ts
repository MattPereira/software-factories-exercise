export function normalise(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function greetingFor(name: string) {
  const clean = normalise(name);
  return clean ? `Hello, ${clean}!` : "Hello, stranger!";
}

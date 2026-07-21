declare module "*.svg" {
  const source: string;
  export default source;
}

declare module "*.svg?url" {
  const source: string;
  export default source;
}

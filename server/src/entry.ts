import { pathToFileURL } from 'node:url';

export function isEntryPoint(moduleUrl: string, scriptPath: string | undefined = process.argv[1]): boolean {
  return scriptPath !== undefined && moduleUrl === pathToFileURL(scriptPath).href;
}

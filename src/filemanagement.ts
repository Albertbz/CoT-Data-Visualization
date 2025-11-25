import { writeFileSync } from 'fs';
/**
 * Save parsed sheet data to a local JSON file.
 * 
 * @param sheetData The data to save.
 * @param filePath The path of the file to save to.
 */
export function saveParsedDataToFile(sheetData: { [sheetName: string]: { [key: string]: string | number | boolean }[] }, filePath: string): void {
  const jsonData = JSON.stringify(sheetData, null, 2);
  writeFileSync(filePath, jsonData, 'utf-8');
}
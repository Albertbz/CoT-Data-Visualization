import { writeFileSync } from 'fs';
/**
 * Save parsed sheet data to a local JSON file.
 * 
 * @param sheetData The data to save.
 * @param filePath The path of the file to save to.
 */
export function saveParsedDataToFile(sheetData: { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string }[], filePath: string): void {
  const jsonData = JSON.stringify(sheetData, null, 2);
  writeFileSync(filePath, jsonData, 'utf-8');
}
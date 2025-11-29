import { writeFileSync } from 'fs';
/**
 * Save parsed house data to a local JSON file.
 * 
 * @param houseData The data to save.
 * @param filePath The path of the file to save to.
 */
export function saveParsedHouseDataToFile(houseData: { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string }[], filePath: string): void {
  const jsonData = JSON.stringify(houseData, null, 2);
  writeFileSync(filePath, jsonData, 'utf-8');
}

/**
 * Save parsed age data to a local JSON file.
 * 
 * @param ageData The data to save.
 * @param filePath The path of the file to save to.
 */
export function saveParsedAgeDataToFile(ageData: { "Discord Username": string; "VS Username": string; "Character Name": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number }[], filePath: string): void {
  const jsonData = JSON.stringify(ageData, null, 2);
  writeFileSync(filePath, jsonData, 'utf-8');
}

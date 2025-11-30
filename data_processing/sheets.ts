import { GaxiosResponse } from 'gaxios';
import { google, Auth, sheets_v4 } from 'googleapis';

/**
 * Given an authenticated client, returns a Google Sheets client.
 * 
 * @param auth An authenticated JWT client.
 * @returns A Google Sheets client.
 */
export function getSheetsClient(auth: Auth.JWT): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth });
}

/**
 * Given a spreadsheet ID, returns all the sheets in the spreadsheet.
 * 
 * @param sheets An authenticated Google Sheets client.
 * @param spreadsheetId The ID of the spreadsheet.
 * @returns A promise that resolves to an array of Sheet objects.
 */
export async function getSheetsInSpreadsheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<sheets_v4.Schema$Sheet[]> {
  const result = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  });
  const sheetsList = result.data.sheets ?? [];

  return sheetsList;
}

/**
 * Given a spreadsheet ID and a sheet name, returns the data in that sheet.
 * 
 * @param sheets An authenticated Google Sheets client.
 * @param spreadsheetId The ID of the spreadsheet.
 * @param sheetName The name of the sheet.
 * @returns A promise that resolves to a 2D array of cell values.
 */
export async function getSheetData(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<(string | number | boolean)[][]> {
  // Get the values in the specified sheet. Take into account the quota limits
  // for reading data from Google Sheets API. Retry after a delay if quota exceeded.
  let result;
  try {
    result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: sheetName,
    });
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    // Implement a delay before retrying, e.g., using setTimeout or a sleep function
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for 60 seconds
    result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: sheetName,
    });
  }
  const values = result.data.values ?? [];
  return values;
}

/**
 * Given a spreadsheet ID, returns all data in that sheet as a 3D array with
 * the sheet name as the first dimension, rows as the second dimension, and 
 * cells as the third dimension. Each cell includes both its value and formatting.
 * 
 * @param sheets An authenticated Google Sheets client.
 * @param spreadsheetId The ID of the spreadsheet.
 * @returns A promise that resolves to a 2D array of all rows for each sheet.
 */
export async function getAllSheetData(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<{ [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][] }> {
  // All data object to hold data from all sheets
  // The keys are sheet names, and the values are objects with cell value and
  // formatting information.
  const allData: { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][]} = {};

  // First, get all sheets in the spreadsheet. There is a limit to how many times
  // this can be called in X minutes, so handle the exception if it occurs, log
  // it, and try again after a delay.
  let result: GaxiosResponse<sheets_v4.Schema$Spreadsheet> | null = null;
  try {
    result = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
      fields: 'sheets'
    });
  } catch (error) {
    console.error('Error fetching sheets:', error);
    // Implement a delay before retrying, e.g., using setTimeout or a sleep function
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for 60 seconds
    result = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
      fields: 'sheets'
    });
  }

  if (!result.data.sheets) {
    return {};
  }
  const sheetsInSpreadsheet = result.data.sheets;

  // Remove Overview sheet if it exists
  const overviewIndex = sheetsInSpreadsheet.findIndex(sheet => sheet.properties?.title === 'Overview');
  if (overviewIndex !== -1) {
    sheetsInSpreadsheet.splice(overviewIndex, 1);
  }

  // For each sheet, get the effectiveValue and the effectiveFormat of each cell
  // in each row, and store it in the allData object.
  for (const sheet of sheetsInSpreadsheet) {
    const sheetData = sheet.data![0].rowData?.map((row) => {
        return row.values?.map((cell) => {
          return {
            cellValue: cell.effectiveValue ? (cell.effectiveValue.stringValue ?? cell.effectiveValue.numberValue ?? cell.effectiveValue.boolValue ?? '') : '',
            cellFormat: cell.effectiveFormat ?? {},
          }
        }) ?? [];
      }) ?? [];
    allData[sheet.properties?.title ?? ''] = sheetData;
  }

  return allData;
}
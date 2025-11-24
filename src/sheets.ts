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
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId,
    range: sheetName,
  });

  const values = result.data.values ?? [];
  return values;
}

/**
 * Given a spreadsheet ID, returns all data in that sheet as a 3D array with
 * the sheet name as the first dimension, and rows and columns as the second 
 * and third dimensions.
 * @param sheets An authenticated Google Sheets client.
 * @param spreadsheetId The ID of the spreadsheet.
 * @returns A promise that resolves to a 3D array of cell values.
 */
export async function getAllSheetData(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<{ [sheetName: string]: (string | number | boolean)[][] }> {
  const sheetsInSpreadsheet = await getSheetsInSpreadsheet(sheets, spreadsheetId);
  // All data object to hold data from all sheets
  // The keys are sheet names, and the values are 2D arrays of cell values
  // The first row is the header row, and the subsequent rows are the data rows
  // Example: { 'Sheet1': [ ['Header1', 'Header2'], ['Data1', 'Data2'], ... ], ... }
  const allData: { [sheetName: string]: (string | number | boolean)[][] } = {};

  // Get the names only of the sheets to be used as ranges
  const sheetNames = sheetsInSpreadsheet.map(sheet => sheet.properties?.title).filter((name): name is string => !!name);

  // Remove the 'Overview' sheet if it exists
  const overviewIndex = sheetNames.indexOf('Overview');
  if (overviewIndex !== -1) {
    sheetNames.splice(overviewIndex, 1);
  }

  // Fetch data with batchGet
  const result = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: spreadsheetId,
    ranges: sheetNames,
  });

  // Split the data into the allData object
  if (result.data.valueRanges) {
    result.data.valueRanges.forEach((valueRange, index) => {
      const sheetName = sheetNames[index];
      allData[sheetName] = valueRange.values ?? [];
    });
  }

  return allData;
}
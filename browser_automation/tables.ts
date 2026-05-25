import { getBrowserAndPage } from "./engine";

export async function extractTableData(selector?: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER-TABLE] Extracting tabular data from page (selector=${selector || "auto-detect"})`);
  
  const markdownTable = await page.evaluate((sel) => {
    let table = sel ? document.querySelector(sel) : document.querySelector("table");
    if (!table) {
      table = document.querySelector('[role="table"]') || document.querySelector('[role="grid"]');
    }
    if (!table) return "ERROR: No table elements found on the current page.";

    const rows = Array.from(table.querySelectorAll("tr, [role='row']"));
    if (rows.length === 0) return "ERROR: Table element found but it contains no rows.";

    let md = "";
    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll("th, td, [role='columnheader'], [role='gridcell']"));
      const cellTexts = cells.map(cell => (cell.textContent || "").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|"));
      
      md += `| ${cellTexts.join(" | ")} |\n`;
      
      if (rowIndex === 0) {
        const separators = cellTexts.map(() => "---");
        md += `| ${separators.join(" | ")} |\n`;
      }
    });
    return md;
  }, selector);

  return markdownTable;
}

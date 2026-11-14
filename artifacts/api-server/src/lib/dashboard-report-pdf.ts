import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type { ReportData } from "./dashboard-report-data";
import { reportLabel, reportWording } from "./dashboard-report-data";
import type { ReportNarrative, ReportComment } from "./dashboard-report-ai";

/** Render in memory: no public file, temporary URL or retained copy of private selections. */
export function renderDashboardReport(data: ReportData, narrative: ReportNarrative): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 87, bottom: 55, left: 42, right: 42 },
      bufferPages: true, info: { Title: `AE+ ${data.label} — AI Report`, Author: "Airline Economics+",
        Subject: "Selected dashboard snapshot and AI-powered summary" } });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont("Report", fileURLToPath(new URL("../assets/DejaVuSans.ttf", import.meta.url)));
      const navy = "#123047", teal = "#008779", ink = "#263d4b", muted = "#5e7180";
      const width = doc.page.width - 84;
      const text = (value: string) => reportWording(value).replace(/\u0000/g, "");
      const header = () => {
        doc.rect(0, 0, doc.page.width, 65).fill(navy);
        doc.font("Report").fontSize(17).fillColor("#ffffff").text("AIRLINE ECONOMICS+", 42, 16, { lineBreak: false });
        doc.fontSize(8).fillColor("#8dd8c8").text("AE+ DATA ANALYTICS  /  PRIVATE TEAM REPORT", 42, 43, { lineBreak: false });
        doc.fillColor(ink).fontSize(9); doc.x = 42; doc.y = 87;
      };
      header(); doc.on("pageAdded", header);
      const ensure = (height: number) => { if (doc.y + height > doc.page.height - 58) doc.addPage(); };
      const paragraph = (value: string, color = ink) => {
        doc.font("Report").fontSize(9).fillColor(color).text(text(value), 42, doc.y, { width, lineGap: 3 });
        doc.moveDown(0.65);
      };
      const heading = (value: string) => {
        ensure(62); doc.moveDown(0.6);
        doc.font("Report").fontSize(12).fillColor(teal).text(text(value), 42, doc.y, { width });
        doc.moveDown(0.5); doc.fontSize(9).fillColor(ink);
      };
      const comment = (item: ReportComment) => paragraph(`${item.text} [${item.sectionIds.join(", ")}]`);
      doc.fontSize(21).fillColor(navy).text(`${data.label}`, 42, doc.y, { width });
      doc.moveDown(0.3);
      doc.fontSize(12).fillColor(teal).text("AI-powered dashboard report");
      doc.moveDown(0.6);
      paragraph(`Generated ${new Date(data.generatedAt).toLocaleString("en-GB", { timeZone: "UTC", hour12: false })} UTC`, muted);
      heading("Selections captured for this report");
      paragraph(Object.entries(data.filters).map(([key, val]) =>
        `${reportLabel(key)}: ${Array.isArray(val) ? val.length ? val.join(", ") : "All" : val === "" ? "All / no restriction" : val}`
      ).join("\n") || "All data / module default selections");
      paragraph("This PDF reflects the selections at generation start. Later dashboard changes do not change this file.", muted);
      heading("Executive summary");
      comment(narrative.summary);
      heading("Key observations");
      narrative.highlights.forEach(comment);
      heading("Data scope and interpretation");
      data.notes.forEach(note => paragraph(note, muted));

      for (const section of data.sections) {
        heading(`${section.title} [${section.id}]`);
        for (const metric of section.metrics) {
          ensure(29);
          paragraph(`${metric.label}: ${metric.value}`);
        }
        for (const table of section.tables) {
          heading(table.title);
          const cols = table.columns.length;
          const colWidth = width / cols;
          const renderRow = (cells: string[], headerRow: boolean) => {
            doc.font("Report").fontSize(7.3);
            const heights = cells.map(cell => doc.heightOfString(text(cell), { width: colWidth - 12, lineGap: 2 }));
            const height = Math.max(23, ...heights.map(h => h + 12));
            ensure(height + 2);
            const y = doc.y;
            doc.rect(42, y, width, height).fill(headerRow ? navy : "#f0f5f7");
            cells.forEach((cell, index) => {
              doc.fillColor(headerRow ? "#ffffff" : ink).fontSize(7.3)
                .text(text(cell), 48 + colWidth * index, y + 6, { width: colWidth - 12, lineGap: 2 });
            });
            doc.y = y + height + 2; doc.x = 42;
          };
          renderRow(table.columns, true);
          for (const row of table.rows) {
            doc.fontSize(7.3);
            const height = Math.max(23, ...row.map(cell => doc.heightOfString(text(cell), { width: colWidth - 12, lineGap: 2 }) + 12));
            if (doc.y + height > doc.page.height - 58) { doc.addPage(); renderRow(table.columns, true); }
            renderRow(row, false);
          }
          doc.moveDown(0.5);
          paragraph(table.note, muted);
        }
      }
      heading("Sources and methodology");
      data.sources.forEach(source => paragraph(`[${source.id}] ${source.source}`));
      paragraph("Numbers are calculated directly from the selected imported datasets using the dashboard's validated queries. Displayed lists are bounded source results, not the basis for recomputing totals. Blank numerical values mean unavailable, not zero. AI commentary does not replace the underlying source data.", muted);
      heading("Reliance on Information Posted & Disclaimer");
      paragraph("It is noted and agreed by all users that Airline Economics Ltd and all trading names/brands associated with the same shall have no liability whatsoever for any financial/material loss and/or financial or material damage(s) however it arises, resulting from the utilization of this website and the databases and information contained therein. The materials contained on our site are provided for general information purposes only and do not claim to be or constitute legal or other professional advice and shall not be relied upon as such. Whilst every effort has been taken to ensure the accuracy of the information provided in these pages and on this site in general, it is your responsibility to check the accuracy of relevant facts and opinions given on the site before entering into any commitment based upon the same.", muted);
      paragraph("All rights reserved. No part of this publication/website/database may be reproduced by any means whatsoever without express permission of Airline Economics Ltd. Although great care has been taken in the compilation publications and data, Airline Economics Ltd does not take any responsibility for the views expressed herein.", muted);
      const range = doc.bufferedPageRange();
      doc.removeListener("pageAdded", header);
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.font("Report").fontSize(7).fillColor(muted)
          .text(`AE+ | ${data.label} | Confidential team use`, 42, doc.page.height - 35, { lineBreak: false })
          .text(`${i + 1} / ${range.count}`, doc.page.width - 77, doc.page.height - 35, { lineBreak: false });
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { GeneratedContent, ExportOptions } from './types';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';

export class ContentExporter {
  private uploadDir: string;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'exports');
    this.ensureUploadDir();
  }

  private ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async export(content: GeneratedContent, options: ExportOptions): Promise<string> {
    const filename = this.generateFilename(content, options.format);
    const filepath = path.join(this.uploadDir, filename);

    switch (options.format) {
      case 'pdf':
        await this.exportToPDF(content, filepath, options);
        break;
      case 'docx':
        await this.exportToDocx(content, filepath, options);
        break;
      case 'html':
        await this.exportToHTML(content, filepath, options);
        break;
      case 'markdown':
        await this.exportToMarkdown(content, filepath, options);
        break;
      case 'epub':
        await this.exportToEpub(content, filepath, options);
        break;
      default:
        throw new AppError(`Unsupported export format: ${options.format}`, 400);
    }

    return `/uploads/exports/${filename}`;
  }

  private async exportToPDF(
    content: GeneratedContent,
    filepath: string,
    options: ExportOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: options.styling?.margins || { top: 72, bottom: 72, left: 72, right: 72 },
          info: {
            Title: options.metadata?.title || content.title,
            Author: options.metadata?.author || 'Omi RSS',
            Subject: options.metadata?.subject || content.type,
            Keywords: options.metadata?.keywords?.join(', ') || '',
          },
        });

        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // Add watermark if specified
        if (options.watermark) {
          doc.fontSize(60)
            .fillColor('#cccccc')
            .opacity(0.3)
            .text(options.watermark, 100, 300, {
              rotate: 45,
              align: 'center',
            })
            .opacity(1)
            .fillColor('black');
        }

        // Title
        doc.fontSize(24)
          .font('Helvetica-Bold')
          .text(content.title, { align: 'center' })
          .moveDown();

        // Metadata
        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' })
          .text(`Type: ${content.type}`, { align: 'center' })
          .moveDown()
          .fillColor('black');

        // Content
        if (content.format === 'markdown') {
          const html = marked(content.content);
          const dom = new JSDOM(html);
          const elements = dom.window.document.body.children;

          for (const element of elements) {
            this.renderHTMLElementToPDF(doc, element, options);
          }
        } else {
          doc.fontSize(options.styling?.fontSize || 12)
            .font(options.styling?.font || 'Helvetica')
            .text(content.content, {
              align: 'left',
              lineGap: options.styling?.lineHeight || 6,
            });
        }

        // Footer
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(10)
            .fillColor('#666666')
            .text(
              `Page ${i + 1} of ${pages.count}`,
              72,
              doc.page.height - 50,
              { align: 'center' }
            );
        }

        doc.end();

        stream.on('finish', () => {
          logger.info(`PDF exported: ${filepath}`);
          resolve();
        });

        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  private renderHTMLElementToPDF(
    doc: PDFKit.PDFDocument,
    element: Element,
    options: ExportOptions
  ) {
    const tagName = element.tagName.toLowerCase();
    const text = element.textContent || '';

    switch (tagName) {
      case 'h1':
        doc.fontSize(20).font('Helvetica-Bold').text(text).moveDown();
        break;
      case 'h2':
        doc.fontSize(18).font('Helvetica-Bold').text(text).moveDown();
        break;
      case 'h3':
        doc.fontSize(16).font('Helvetica-Bold').text(text).moveDown();
        break;
      case 'p':
        doc.fontSize(12).font('Helvetica').text(text).moveDown();
        break;
      case 'ul':
      case 'ol':
        const items = element.querySelectorAll('li');
        items.forEach((item, index) => {
          const prefix = tagName === 'ol' ? `${index + 1}. ` : '• ';
          doc.fontSize(12).font('Helvetica').text(prefix + item.textContent).moveDown(0.5);
        });
        doc.moveDown();
        break;
      case 'blockquote':
        doc.fontSize(12)
          .font('Helvetica-Oblique')
          .fillColor('#666666')
          .text(text, { indent: 20 })
          .fillColor('black')
          .moveDown();
        break;
      case 'code':
        doc.fontSize(11)
          .font('Courier')
          .fillColor('#333333')
          .text(text)
          .fillColor('black')
          .moveDown();
        break;
      case 'hr':
        doc.moveTo(72, doc.y)
          .lineTo(doc.page.width - 72, doc.y)
          .stroke()
          .moveDown();
        break;
    }
  }

  private async exportToDocx(
    content: GeneratedContent,
    filepath: string,
    options: ExportOptions
  ): Promise<void> {
    const doc = new Document({
      creator: options.metadata?.author || 'Omi RSS',
      title: options.metadata?.title || content.title,
      description: options.metadata?.subject || content.type,
      styles: {
        default: {
          document: {
            run: {
              font: options.styling?.font || 'Calibri',
              size: (options.styling?.fontSize || 11) * 2, // Half-points
            },
          },
        },
      },
      sections: [{
        properties: {},
        children: this.convertContentToDocxParagraphs(content, options),
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filepath, buffer);
    logger.info(`DOCX exported: ${filepath}`);
  }

  private convertContentToDocxParagraphs(
    content: GeneratedContent,
    options: ExportOptions
  ): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    // Title
    paragraphs.push(
      new Paragraph({
        text: content.title,
        heading: HeadingLevel.TITLE,
        alignment: 'center',
      })
    );

    // Metadata
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Generated on ${new Date().toLocaleDateString()} | Type: ${content.type}`,
            size: 20,
            color: '666666',
          }),
        ],
        alignment: 'center',
        spacing: { after: 400 },
      })
    );

    // Content
    if (content.format === 'markdown') {
      const html = marked(content.content);
      const dom = new JSDOM(html);
      const elements = dom.window.document.body.children;

      for (const element of elements) {
        paragraphs.push(...this.convertHTMLElementToDocx(element));
      }
    } else {
      // Plain text
      const lines = content.content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          paragraphs.push(
            new Paragraph({
              text: line,
              spacing: { after: 200 },
            })
          );
        }
      }
    }

    return paragraphs;
  }

  private convertHTMLElementToDocx(element: Element): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const tagName = element.tagName.toLowerCase();
    const text = element.textContent || '';

    switch (tagName) {
      case 'h1':
        paragraphs.push(
          new Paragraph({
            text,
            heading: HeadingLevel.HEADING_1,
          })
        );
        break;
      case 'h2':
        paragraphs.push(
          new Paragraph({
            text,
            heading: HeadingLevel.HEADING_2,
          })
        );
        break;
      case 'h3':
        paragraphs.push(
          new Paragraph({
            text,
            heading: HeadingLevel.HEADING_3,
          })
        );
        break;
      case 'p':
        paragraphs.push(
          new Paragraph({
            text,
            spacing: { after: 200 },
          })
        );
        break;
      case 'ul':
      case 'ol':
        const items = element.querySelectorAll('li');
        items.forEach((item, index) => {
          paragraphs.push(
            new Paragraph({
              text: item.textContent || '',
              bullet: tagName === 'ul' ? { level: 0 } : undefined,
              numbering: tagName === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
            })
          );
        });
        break;
      case 'blockquote':
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text,
                italics: true,
                color: '666666',
              }),
            ],
            indent: { left: 720 }, // 0.5 inch
            spacing: { after: 200 },
          })
        );
        break;
    }

    return paragraphs;
  }

  private async exportToHTML(
    content: GeneratedContent,
    filepath: string,
    options: ExportOptions
  ): Promise<void> {
    let htmlContent = content.content;

    if (content.format === 'markdown') {
      htmlContent = marked(content.content);
    } else if (content.format === 'text') {
      htmlContent = `<pre>${content.content}</pre>`;
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.metadata?.title || content.title}</title>
    <meta name="author" content="${options.metadata?.author || 'Omi RSS'}">
    <meta name="description" content="${options.metadata?.subject || content.type}">
    <meta name="keywords" content="${options.metadata?.keywords?.join(', ') || ''}">
    <style>
        body {
            font-family: ${options.styling?.font || 'Arial, sans-serif'};
            font-size: ${options.styling?.fontSize || 16}px;
            line-height: ${options.styling?.lineHeight || 1.6};
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            color: ${options.styling?.colors?.text || '#333'};
            background-color: ${options.styling?.colors?.background || '#fff'};
        }
        h1, h2, h3, h4, h5, h6 {
            color: ${options.styling?.colors?.heading || '#000'};
            margin-top: 1.5em;
            margin-bottom: 0.5em;
        }
        a {
            color: ${options.styling?.colors?.link || '#0066cc'};
            ${!options.includeLinks ? 'text-decoration: none; pointer-events: none;' : ''}
        }
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 1em;
            margin-left: 0;
            color: #666;
            font-style: italic;
        }
        code {
            background-color: #f4f4f4;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        pre {
            background-color: #f4f4f4;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }
        .metadata {
            text-align: center;
            color: #666;
            font-size: 0.9em;
            margin-bottom: 2em;
            padding-bottom: 1em;
            border-bottom: 1px solid #ddd;
        }
        ${options.watermark ? `
        .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 5em;
            color: rgba(0, 0, 0, 0.1);
            z-index: -1;
            user-select: none;
        }
        ` : ''}
    </style>
</head>
<body>
    ${options.watermark ? `<div class="watermark">${options.watermark}</div>` : ''}
    <h1>${content.title}</h1>
    <div class="metadata">
        <p>Generated on ${new Date().toLocaleDateString()} | Type: ${content.type}</p>
    </div>
    <div class="content">
        ${htmlContent}
    </div>
</body>
</html>`;

    fs.writeFileSync(filepath, html);
    logger.info(`HTML exported: ${filepath}`);
  }

  private async exportToMarkdown(
    content: GeneratedContent,
    filepath: string,
    options: ExportOptions
  ): Promise<void> {
    let markdown = `# ${content.title}\n\n`;
    markdown += `> Generated on ${new Date().toLocaleDateString()} | Type: ${content.type}\n\n`;

    if (options.metadata) {
      markdown += `---\n`;
      markdown += `title: ${options.metadata.title || content.title}\n`;
      markdown += `author: ${options.metadata.author || 'Omi RSS'}\n`;
      markdown += `date: ${new Date().toISOString()}\n`;
      if (options.metadata.keywords) {
        markdown += `tags: [${options.metadata.keywords.join(', ')}]\n`;
      }
      markdown += `---\n\n`;
    }

    if (content.format === 'markdown') {
      markdown += content.content;
    } else if (content.format === 'html') {
      // Convert HTML to Markdown (basic conversion)
      const dom = new JSDOM(content.content);
      markdown += this.htmlToMarkdown(dom.window.document.body);
    } else {
      // Plain text
      markdown += content.content;
    }

    fs.writeFileSync(filepath, markdown);
    logger.info(`Markdown exported: ${filepath}`);
  }

  private async exportToEpub(
    content: GeneratedContent,
    filepath: string,
    options: ExportOptions
  ): Promise<void> {
    // Simplified EPUB export - would need a proper EPUB library in production
    const epubContent = {
      title: options.metadata?.title || content.title,
      author: options.metadata?.author || 'Omi RSS',
      content: content.content,
      format: content.format,
      date: new Date().toISOString(),
    };

    // For now, just save as JSON (would need proper EPUB generation)
    fs.writeFileSync(filepath, JSON.stringify(epubContent, null, 2));
    logger.info(`EPUB (JSON) exported: ${filepath}`);
  }

  private htmlToMarkdown(element: Element): string {
    let markdown = '';
    
    for (const child of element.children) {
      const tagName = child.tagName.toLowerCase();
      const text = child.textContent || '';

      switch (tagName) {
        case 'h1':
          markdown += `# ${text}\n\n`;
          break;
        case 'h2':
          markdown += `## ${text}\n\n`;
          break;
        case 'h3':
          markdown += `### ${text}\n\n`;
          break;
        case 'p':
          markdown += `${text}\n\n`;
          break;
        case 'ul':
          child.querySelectorAll('li').forEach(li => {
            markdown += `- ${li.textContent}\n`;
          });
          markdown += '\n';
          break;
        case 'ol':
          child.querySelectorAll('li').forEach((li, index) => {
            markdown += `${index + 1}. ${li.textContent}\n`;
          });
          markdown += '\n';
          break;
        case 'blockquote':
          markdown += `> ${text}\n\n`;
          break;
        case 'code':
          markdown += `\`${text}\``;
          break;
        case 'pre':
          markdown += `\`\`\`\n${text}\n\`\`\`\n\n`;
          break;
      }
    }

    return markdown;
  }

  private generateFilename(content: GeneratedContent, format: string): string {
    const sanitizedTitle = content.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    const timestamp = Date.now();
    return `${sanitizedTitle}-${timestamp}.${format}`;
  }

  async cleanupOldExports(olderThanDays: number = 7): Promise<number> {
    const files = fs.readdirSync(this.uploadDir);
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const file of files) {
      const filepath = path.join(this.uploadDir, file);
      const stats = fs.statSync(filepath);

      if (stats.mtimeMs < cutoffTime) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    }

    logger.info(`Cleaned up ${deletedCount} old export files`);
    return deletedCount;
  }
}

export const contentExporter = new ContentExporter();
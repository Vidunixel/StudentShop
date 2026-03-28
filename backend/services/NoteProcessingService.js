const path = require("path");
const { PDFDocument, rgb, PDFName, PDFDict, PDFArray} = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const {v4: uuidv4 } = require("uuid");
const fs = require("fs").promises;
const QRCode = require("qrcode");
const sharp = require("sharp");
const pdf2pic = require("pdf2pic");
const OpenAI = require("openai");
const Subject = require("../models/Subject");
const Validator = require("../validators/Validator");
const {r2} = require("../server");
const {PutObjectCommand} = require("@aws-sdk/client-s3");
const { promisify } = require("util");
const { exec, execFile } = require("child_process");
const sodium = require("libsodium-wrappers");
const cheerio = require("cheerio");
const {Environment} = require("../models/common");
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
let pdfjs;

/**
 * Dynamically load ES modules.
 * @return {Promise<void>}
 */
async function loadEsModules() {
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
}
loadEsModules();

class NoteProcessingService {
  static #openAiApiKey = process.env.OPENAI_API_KEY;
  static #openAiNoteReviewerPromptId = "pmpt_68dd1ad7d7508197b569c9d359c823590e65a81b66ae975c";
  static #fontPath = path.join(__dirname, "../assets/public/InterVariable.ttf"); // font directory.
  static #logoPath = path.join(__dirname, "../assets/public/logo_favicon.png"); // logo_favicon directory.
  static #pdfOwnerPassword = process.env.PDF_OWNER_PASSWORD;
  static #tempNoteConversionPath = path.join(__dirname, "../assets/private/temp-note-conversion");
  static #tempNoteEncryptionPath = path.join(__dirname, "../assets/private/temp-note-encryption");
  static #tempNoteDecryptionPath = path.join(__dirname, "../assets/private/temp-note-decryption");

  static #notesBucketName = process.env.ENVIRONMENT === Environment.PRODUCTION ? "private-notes" : "dev-private-notes"; // notes bucket name.
  static #noteCoversBucketName = process.env.ENVIRONMENT === Environment.PRODUCTION ? "public-note-covers" : "dev-public-note-covers"; // notes bucket name.

  #parsedParams;
  #fileBuffer;

  /**
   * Constructor - creates an instance of the ProcessNoteService class with specific attributes.
   * @param parsedParams The parameters passed from the post request.
   * @param fileBuffer The buffer of the PDF file.
   */
  constructor(parsedParams, fileBuffer) {
    this.#parsedParams = parsedParams;
    this.#fileBuffer = fileBuffer;
  }

  /**
   * Encrypt an html file using sodium.
   * @param htmlBuffer The html buffer to encrypt.
   * @returns {Promise<Buffer<ArrayBuffer>>}
   */
  static async encryptHtmlForViewing(htmlBuffer) {
    await sodium.ready;

    const key = sodium.from_base64(process.env.NOTE_ENCRYPTION_KEY_B64);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

    // Encrypt.
    const cipher = sodium.crypto_secretbox_easy(htmlBuffer, nonce, key);

    return Buffer.concat([Buffer.from(nonce), Buffer.from(cipher)]);
  }

  /**
   * Encrypt a pdf with pdfOwnerPassword.
   * @param pdfBytes The PDF bytes to encrypt.
   * @returns {Promise<Buffer<ArrayBuffer>>} Encrypted PDF buffer.
   */
  static async #passwordProtectPdf(pdfBytes) {
    const uniqueIdentifier = uuidv4();

    const tempInputNotePath = path.join(NoteProcessingService.#tempNoteEncryptionPath, `${uniqueIdentifier}-input.pdf`);
    const tempOutputNotePath = path.join(NoteProcessingService.#tempNoteEncryptionPath, `${uniqueIdentifier}-output.pdf`);

    // Save pdf temporarily on disk.
    await fs.writeFile(tempInputNotePath, pdfBytes);

    async function deleteTempFiles() {
      try{
        // Delete temporary files.
        await fs.unlink(tempInputNotePath);
        await fs.unlink(tempOutputNotePath);
      } catch (error) {
        console.error(error);
      }
    }

    try {
      // Run qpdf command.
      const args = [
        "--encrypt",
        "",
        NoteProcessingService.#pdfOwnerPassword,
        "256",
        "--print=full",
        "--modify=none",
        "--extract=y",
        "--annotate=y",
        "--form=n",
        "--",
        tempInputNotePath,
        tempOutputNotePath
      ];
      const { stdout, stderr } = await execFileAsync("qpdf", args);

      // Read encrypted file.
      const encryptedPdfBytes = await fs.readFile(tempOutputNotePath);

      await deleteTempFiles(); // Delete temporary files.
      return encryptedPdfBytes;
    } catch (error) {
      await deleteTempFiles(); // Delete temporary files.
      console.error(error);
      throw error;
    }
  }

  /**
   * Determine if a PDF buffer is encrypted.
   * @param pdfBuffer The PDF buffer to check.
   * @returns {Promise<boolean>} True if encrypted, false if not.
   */
  static async isPdfRestricted(pdfBuffer) {
    const pdfBytes = new Uint8Array(pdfBuffer);
    const uniqueIdentifier = uuidv4();

    const tempInputNoteName = path.join(NoteProcessingService.#tempNoteDecryptionPath, `${uniqueIdentifier}-input.pdf`);

    // Save pdf temporarily on disk.
    await fs.writeFile(tempInputNoteName, pdfBytes);

    async function deleteTempFiles() {
      try{
        // Delete temporary files.
        await fs.unlink(tempInputNoteName);
      } catch (error) {
        console.error(error);
      }
    }

    let isPdfRestricted;
    const unrestrictedFileMessage = "File is not encrypted";
    try {
      // Run qpdf command.
      const args = [
        "--show-encryption",
        "--",
        tempInputNoteName
      ];
      const { stdout, stderr } = await execFileAsync("qpdf", args);

      // If output doesn't contain unrestrictedFileMessage, return true, else false.
      isPdfRestricted = !(stdout.includes(unrestrictedFileMessage) || stderr.includes(unrestrictedFileMessage));

      await deleteTempFiles(); // Delete temporary files.
    } catch (error) {
      await deleteTempFiles(); // Delete temporary files.
      console.error(error);
      throw error;
    }

    return isPdfRestricted;
  }

  /**
   * Create a review for the note using OpenAI note reviewer assistant.
   * @return {Promise<*>} The review in json format.
   */
  async getAiAnalysis() {
    // Get AI analysis from OpenAI.
    let aiAnalysis = {};
    try {
      const openai = new OpenAI({
        apiKey: NoteProcessingService.#openAiApiKey,
      });

      // Get subjects as a string to pass to API if subjectIds exist for note.
      let formattedSubjects;
      if (this.#parsedParams.subjectIds) {
        try {
          formattedSubjects = await NoteProcessingService.#getSubjectsAsString(this.#parsedParams.subjectIds);
        } catch (error) {
          console.error(error);
        }
      }

      // Convert note to base64 string.
      const fileBase64 = this.#fileBuffer.toString("base64");

      // Get AI response.
      const response = await openai.responses.create({
        prompt: {
          "id": NoteProcessingService.#openAiNoteReviewerPromptId,
          "version": "2"
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: `${this.#parsedParams.title}.pdf`,
                file_data: `data:application/pdf;base64,${fileBase64}`,
              },
              {
                type: "input_text",
                text: this.#parsedParams.subjectIds ?
                  `{ title: ${this.#parsedParams.title}, description: ${this.#parsedParams.description}, subjects: ${formattedSubjects} }` :
                  `{ title: ${this.#parsedParams.title}, description: ${this.#parsedParams.description}`,
              }
            ],
          },
        ],
        text: {
          "format": {
            "type": "json_schema",
            "name": "formatted_review",
            "strict": false,
            "schema": {
              "type": "object",
              "properties": {
                "flaggedSections": {
                  "type": "array",
                  "items": {
                    "enum": [
                      "title",
                      "description",
                      "subjects",
                      "noteContent"
                    ]
                  }
                },
                "feedback": {
                  "type": "string"
                },
                "rating": {
                  "type": "integer"
                },
                "review": {
                  "type": "string"
                },
                "isAccepted": {
                  "type": "boolean"
                }
              },
              "required": [
                "isAccepted"
              ],
              "additionalProperties": false
            }
          }
        },
        reasoning: {},
        store: false,
        include: []
      });

      // Parse the response.
      const parsedResponse = Validator.parseOpenAiFormatterResponse(response?.output_text);
      aiAnalysis = { ...parsedResponse };
    } catch (error) {
      console.error(error);
      aiAnalysis.error = error;
    }
    return aiAnalysis;
  }

  /**
   * Return a string containing subject names and certificates from a list of subject ids.
   * @param subjectIds List of subject ids to format.
   * @return {Promise<*>} String containing subjects.
   */
  static async #getSubjectsAsString(subjectIds) {
    let subjects = await Subject.findManyByIds(subjectIds);

    subjects = subjects.map(subject => subject.certificate ? subject.certificate.concat("/", subject.name) :
      subject.name).toString();
    return subjects;
  }

  /**
   * Sanitise a PDF file by flattening form fields, removing javascript, embedded files, and annotations.
   * @param pdfDoc The PDF to flatten.
   * @return {Promise<PDFDocument>} The flattened PDF.
   */
  async #flattenPdf(pdfDoc) {

    // Flatten form fields.
    pdfDoc.getForm().flatten();

    // Recursively remove JavaScript entries.
    function removeJavaScriptFromDict(dict) {
      if (!dict || !(dict instanceof PDFDict)) return; // If not a valid dictionary, skip.

      // If the dictionary has a /JS (JavaScript) entry, delete it.
      if (dict.has(PDFName.of('JS'))) {
        dict.delete(PDFName.of('JS'));
      }

      // Recursively check all nested dictionaries.
      for (const [_, value] of dict.entries()) {
        if (value instanceof PDFDict) {
          removeJavaScriptFromDict(value);
        }
      }
    }

    // Recursively remove /EmbeddedFiles entries.
    function removeEmbeddedFilesFromDict(dict) {
      if (!dict || !(dict instanceof PDFDict)) return;

      if (dict.has(PDFName.of('EmbeddedFiles'))) {
        dict.delete(PDFName.of('EmbeddedFiles'));
      }

      for (const [_, value] of dict.entries()) {
        if (value instanceof PDFDict) {
          removeEmbeddedFilesFromDict(value);
        }
      }
    }

    // Recursively remove RichMedia entries.
    function removeRichMediaFromDict(dict) {
      if (!dict || !(dict instanceof PDFDict)) return;

      if (dict.has(PDFName.of('RichMediaContent'))) {
        dict.delete(PDFName.of('RichMediaContent'));
      }

      for (const [_, value] of dict.entries()) {
        if (value instanceof PDFDict) {
          removeRichMediaFromDict(value);
        }
      }
    }

    // Recursively remove Launch Actions (/Launch).
    function removeLaunchActionsFromDict(dict) {
      if (!dict || !(dict instanceof PDFDict)) return;

      if (dict.has(PDFName.of('Launch'))) {
        dict.delete(PDFName.of('Launch'));
      }

      for (const [_, value] of dict.entries()) {
        if (value instanceof PDFDict) {
          removeLaunchActionsFromDict(value);
        }
      }
    }

    const pages = pdfDoc.getPages();
    pages.forEach((page) => {
      const { dict } = page.node; // Get the page's dictionary.

      // Remove JS, embedded files, rich media, and launch actions from page.
      removeJavaScriptFromDict(dict);
      removeEmbeddedFilesFromDict(dict);
      removeRichMediaFromDict(dict);
      removeLaunchActionsFromDict(dict);

      // REMOVE ALL ANNOTATIONS.
      if (dict.has(PDFName.of("Annots"))) {
        dict.delete(PDFName.of("Annots"));
      }

      // Remove Additional Actions (AA) dictionary if exists.
      if (dict.has(PDFName.of("AA"))) {
        dict.delete(PDFName.of("AA"));
      }
    });

    const { catalog } = pdfDoc; // Get the document catalog (Root of the PDF structure).

    // Remove JavaScript in OpenAction (automatic action when PDF is opened).
    const openAction = catalog.get(PDFName.of("OpenAction"));
    if (openAction instanceof PDFDict) {
      removeJavaScriptFromDict(openAction);
      removeLaunchActionsFromDict(openAction);
      catalog.delete(PDFName.of("OpenAction"));
    }

    // Remove document-level JavaScript from Names -> JavaScript.
    const namesDict = catalog.get(PDFName.of("Names"));
    if (namesDict instanceof PDFDict) {
      const jsDict = namesDict.get(PDFName.of("JavaScript"));
      if (jsDict instanceof PDFDict) {
        removeJavaScriptFromDict(jsDict);
        namesDict.delete(PDFName.of("JavaScript"));
      }

      const embeddedFilesDict = namesDict.get(PDFName.of("EmbeddedFiles"));
      if (embeddedFilesDict instanceof PDFDict) {
        removeEmbeddedFilesFromDict(embeddedFilesDict);
        namesDict.delete(PDFName.of("EmbeddedFiles"));
      }
    }

    // Remove AcroForm JS.
    const acroForm = catalog.get(PDFName.of("AcroForm"));
    if (acroForm instanceof PDFDict) {
      removeJavaScriptFromDict(acroForm);
      removeLaunchActionsFromDict(acroForm);
      removeEmbeddedFilesFromDict(acroForm);
      removeRichMediaFromDict(acroForm);
    }

    // Clear properties.
    pdfDoc.setTitle(this.#parsedParams.title);
    pdfDoc.setProducer("");
    pdfDoc.setCreator("");
    pdfDoc.setAuthor("");
    pdfDoc.setSubject("");
    pdfDoc.setLanguage("");

    return pdfDoc;
  }

  /**
   * Format a pdf for download by adding banners.
   * @param pdfBuffer Pdf buffer to add banner to.
   * @param noteId The id of the note.
   * @return {Promise<Buffer<Uint8Array>>} Pdf buffer with banner added.
   */
  static async formatForDownload(pdfBuffer, noteId) {
    // Load pdf and get pages.
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    // Margin added to make room for header.
    const marginHeight = 60;

    // Embed font & text.
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await fs.readFile(NoteProcessingService.#fontPath);
    const font = await pdfDoc.embedFont(fontBytes);
    const fontSize = 8;
    const text = "Buy & sell high quality notes at www.studentshop.com.au.";
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    // Embed QR code.
    const qrCodeDesiredWidth = 40; // The desired width for the qrCode.
    const QrCodeData = await QRCode.toDataURL("https://studentshop.com.au/notes/" + noteId,
      {errorCorrectionLevel: "high", margin: 0});
    const QrCode = await pdfDoc.embedPng(QrCodeData);
    const qrCodeSize = QrCode.size();
    const qrCodeDims = QrCode.scale(qrCodeDesiredWidth/qrCodeSize.width);

    // Read and embed logo.
    const logoDesiredWidth = 15; // The desired width for the logo.
    const logo = await pdfDoc.embedPng(await fs.readFile(NoteProcessingService.#logoPath));
    const logoSize = logo.size();
    const logoDims = logo.scale(logoDesiredWidth/logoSize.width);

    // Loop through each page and add header/footer.
    pages.forEach((page) => {
      page.setSize(page.getWidth(), page.getHeight() + marginHeight);
      const { width, height } = page.getSize();

      // Add cta text only if the page is wide enough.
      if (width >= textWidth + marginHeight + (marginHeight - textHeight) / 2) {
        page.drawText(text, {
          x: (marginHeight - textHeight) / 2,
          y: height - textHeight - (marginHeight - textHeight) / 2,
          size: fontSize,
          font: font,
          color: rgb(0.141, 0.149, 0.176),
        });
      }

      // Add qrCode image.
      page.drawImage(QrCode, {
        x: width - qrCodeDims.width - (marginHeight - qrCodeDims.height) / 2,
        y: height - qrCodeDims.height - (marginHeight - qrCodeDims.height) / 2,
        width: qrCodeDims.width,
        height: qrCodeDims.height,
      });

      // Add logo image over qrCode.
      page.drawImage(logo, {
        x: width - logoDims.width - (marginHeight - logoDims.height) / 2,
        y: height - logoDims.height - (marginHeight - logoDims.height) / 2,
        width: logoDims.width,
        height: logoDims.height,
      });
    });

    const pdfBytes = await pdfDoc.save();

    // Encrypt pdf with owner password and restrictions.
    return await NoteProcessingService.#passwordProtectPdf(pdfBytes);
  }

  /**
   * Format a sample note for viewing by only showing content from samplePdfProperties.
   * @param samplePdfProperties An array of page numbers to show.
   * @param htmlBuffer The note to convert to sample.
   * @return {Promise<Buffer<Uint8Array>>} The sample html.
   */
  static async formatForSample(samplePdfProperties, htmlBuffer) {
    const htmlDoc = cheerio.load(htmlBuffer);
    // Remove pages not in samplePdfProperties from html file.
    htmlDoc("#page-container").children().each((index, element) => {
      if (!samplePdfProperties.includes(index + 1)) {
        htmlDoc(element).remove();
      }
    });

    // Convert updated HTML to buffer.
    const formattedHtmlString = htmlDoc.html();
    return Buffer.from(formattedHtmlString, "utf-8");
  }

  /**
   * Return an array of page numbers which roughly make up 5 pages or a certain percentage of the pdf's content,
   * whichever is lower.
   * @param percent The percentage of the pdf's content to show.
   * @return {Promise<*[]>} An array of selected page numbers to show.
   */
  async #generateSamplePdfProperties(percent = 0.15) {
    const { textPerPage, totalTextLength } = await this.#getPdfTextInfo();
    const targetContentSize = totalTextLength * percent;

    let selectedPages = [];
    let selectedContent = 0;
    let availablePages = [...Array(textPerPage.length).keys()]; // Page indexes.

    // Run until at least 5 pages are selected.
    while (selectedContent < targetContentSize && availablePages.length > 0 && selectedPages.length < 5) {
      let randIndex = Math.floor(Math.random() * availablePages.length);
      let selectedIndex = availablePages.splice(randIndex, 1)[0];

      // Add page to selectedPages if randomly selected page does not go above targetContentSize.
      if (selectedContent + textPerPage[selectedIndex] <= targetContentSize) {
        selectedPages.push(selectedIndex + 1); // Convert to page numbers.
        selectedContent += textPerPage[selectedIndex];
      }
    }

    return selectedPages;
  }

  /**
   * Get the number of text per page and the total text length of the pdf.
   * @return {Promise<{textPerPage: *[], totalTextLength: number}>}
   */
  async #getPdfTextInfo() {
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(this.#fileBuffer),
      standardFontDataUrl: path.posix.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/"),
      verbosity: 0
    });
    const pdf = await loadingTask.promise;

    let textPerPage = [];
    let totalTextLength = 0;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const textLength = textContent.items.length;

      textPerPage.push(textLength);
      totalTextLength += textLength;
    }

    return { textPerPage, totalTextLength };
  }

  /**
   * Process and save the pdf to the notesPath directory.
   * @return {Promise<{pdfUniqueName: string, noteCoverUniqueName: string, pageCount: number, samplePdfProperties: Object}>}
   */
  async processAndSavePdf() {
    // Generate unique uuid.
    const pdfUniqueName = uuidv4();

    // Load PDF.
    const pdfDoc = await PDFDocument.load(this.#fileBuffer);

    const flattenedPdfDoc = await this.#flattenPdf(pdfDoc);
    const samplePdfProperties = await this.#generateSamplePdfProperties();

    // Save note cover.
    const noteCoverUniqueName = await this.#saveNoteCover();

    // Serialize the PDF to bytes and save it.
    const pdfBytes = await flattenedPdfDoc.save();
    await r2.send(new PutObjectCommand({
      Bucket: NoteProcessingService.#notesBucketName,
      Key: pdfUniqueName + ".pdf",
      Body: pdfBytes,
      ContentType: "application/pdf"
    }));

    // Save html file.
    await NoteProcessingService.#saveNoteHtml(pdfUniqueName, pdfBytes);

    return { pdfUniqueName, noteCoverUniqueName, pageCount: flattenedPdfDoc.getPageCount(),
      samplePdfProperties };
  }

  /**
   * Converts the first page of a pdf to jpeg and saves it under note covers.
   * @return {Promise<string>} The name of the saved cover image.
   */
  async #saveNoteCover() {
    // Convert 1st page of pdf to jpeg.
    const convert = pdf2pic.fromBuffer(this.#fileBuffer, {
      preserveAspectRatio: true,
      quality: 0,
      format: "jpeg",
      density:	300,
      compression: "jpeg",
      width: 215,
      height: 326,
    });
    let imageBuffer = (await convert(1, { responseType: "buffer" })).buffer;

    // Generate unique uuid.
    const noteCoverUniqueName = uuidv4() + ".webp";

    // Compress and save using Sharp.
    const processedImageBuffer = await sharp(imageBuffer)
      .rotate() // Auto-rotate based on EXIF data.
      .resize(215, 326, { fit: "cover" }) // Resize to a max width of 215px by 326px.
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // Replace transparency with white.
      .webp({ quality: 100 }) // Convert to WebP with 100% quality.
      .toBuffer();

    await r2.send(new PutObjectCommand({
      Bucket: NoteProcessingService.#noteCoversBucketName,
      Key: noteCoverUniqueName,
      Body: processedImageBuffer,
      ContentType: "image/webp"
    }));

    return noteCoverUniqueName;
  }

  /**
   * Converts and saves a pdf as html.
   * @param pdfUniqueName Name of pdf to save.
   * @param pdfBytes Pdf bytes.
   * @returns {Promise<void>}
   */
  static async #saveNoteHtml(pdfUniqueName, pdfBytes) {
    const tempInputNoteFileName = `${pdfUniqueName}-input.pdf`;
    const tempInputNotePath = path.join(NoteProcessingService.#tempNoteConversionPath, tempInputNoteFileName);

    const tempOutputNoteFileName = `${pdfUniqueName}-output.html`;
    const tempOutputNotePath = path.join(NoteProcessingService.#tempNoteConversionPath, tempOutputNoteFileName);

    // Save pdf temporarily on disk.
    await fs.writeFile(tempInputNotePath, pdfBytes);

    async function deleteTempFiles() {
      try{
        // Delete temporary files.
        await fs.unlink(tempInputNotePath);
        await fs.unlink(tempOutputNotePath);
      } catch (error) {
        console.error(error);
      }
    }

    try {
      const cmd = `pdf2htmlEX --embed-javascript 0 --data-dir "${process.env.PDF2HTMLEX_DATA_DIR}" --dest-dir "${NoteProcessingService.#tempNoteConversionPath}" "${tempInputNotePath}" "${tempOutputNoteFileName}"`;
      await execAsync(cmd);

      // Read & save html file.
      const htmlNote = await fs.readFile(tempOutputNotePath);
      await r2.send(new PutObjectCommand({
        Bucket: NoteProcessingService.#notesBucketName,
        Key: pdfUniqueName + ".html",
        Body: htmlNote,
        ContentType: "text/html"
      }));

      await deleteTempFiles(); // Delete temporary files.
    } catch (error) {
      await deleteTempFiles(); // Delete temporary files.
      console.error(error);
      throw error;
    }
  }
}

module.exports = NoteProcessingService;

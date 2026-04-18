"""
PDF Extractor Tool — извлича текст и/или изображения от PDF файлове.

Базиран на: AI_Svetlio EOOD ocr_processor (production модул)
Предназначение: Самостоятелен инструмент за ClientRequests и бъдещи задачи.
Без DB зависимости. Без watchdog. Само ядрото.

Използване:
    python pdf_extractor.py input.pdf                     # извлича текст
    python pdf_extractor.py input.pdf --output-dir ./out  # задава изходна папка
    python pdf_extractor.py input.pdf --force-images      # принудително PNG per page
    python pdf_extractor.py input.pdf --mode both         # текст + изображения

Режими (--mode):
    text   — само текст (default). Ако текстът е лош → fallback към images
    images — само изображения (PNG per page)
    both   — текст + изображения винаги

Зависимости:
    pip install PyMuPDF Pillow pdf2image
    + Poppler (за pdf2image): https://github.com/oschwartz10612/poppler-windows/releases
"""

import io
import json
import logging
import re
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional, List

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERROR: PyMuPDF не е инсталиран. Инсталирай с: pip install PyMuPDF")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow не е инсталиран. Инсталирай с: pip install Pillow")
    sys.exit(1)

try:
    from pdf2image import convert_from_path
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

# ================== LOGGING ==================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


# ================== DATA CLASSES ==================

@dataclass
class PageResult:
    """Резултат от обработката на една страница."""
    page_number: int
    total_pages: int
    has_text: bool
    text: Optional[str] = None
    text_length: int = 0
    valid_text_ratio: float = 0.0
    image_path: Optional[str] = None
    extraction_method: str = ""


@dataclass
class ExtractionResult:
    """Общ резултат от обработката на PDF."""
    source_file: str
    total_pages: int
    mode: str
    timestamp: str = ""
    pages: List[PageResult] = field(default_factory=list)
    full_text: Optional[str] = None
    full_text_length: int = 0
    text_file: Optional[str] = None
    images_dir: Optional[str] = None
    success: bool = True
    error: Optional[str] = None

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()


# ================== CORE FUNCTIONS ==================
# (адаптирани от ocr_processor.py — доказана production логика)

def clean_text(text: str) -> str:
    """Почиства извлечения текст. (от ocr_processor.py)"""
    text = re.sub(r'[\x00-\x1F\x7F]', '', text)
    text = re.sub(r'\n\s*\n', '\n', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def calculate_valid_text_ratio(text: str) -> float:
    """Изчислява дял на валидните символи (Кирилица + ASCII). (от ocr_processor.py)"""
    valid_char_pattern = re.compile(r'[\u0400-\u04FF\u0020-\u007F]+')
    total_chars = len(text)
    valid_chars = len(''.join(valid_char_pattern.findall(text)))
    return valid_chars / total_chars if total_chars > 0 else 0


def should_use_ocr(text: str, threshold: float = 0.5) -> bool:
    """Проверява дали текстът е твърде лош и трябва fallback към OCR/images. (от ocr_processor.py)"""
    return calculate_valid_text_ratio(text) < threshold if text else True


def is_only_page_numbers(text: str) -> bool:
    """Проверява дали текстът съдържа само номера на страници."""
    return bool(re.fullmatch(r'(\s*\d+\s*)+', text.strip()))


def convert_to_optimized_grayscale_png(image: Image.Image, target_size_kb: int = 1000) -> Image.Image:
    """Конвертира изображение в оптимизиран grayscale PNG. (от ocr_processor.py)"""
    try:
        gray_image = image.convert('L')
        quality = 95
        while True:
            buffer = io.BytesIO()
            gray_image.save(buffer, format="PNG", optimize=True, quality=quality)
            size_kb = buffer.getbuffer().nbytes / 1024
            if size_kb <= target_size_kb or quality <= 10:
                buffer.seek(0)
                return Image.open(buffer)
            quality -= 5
    except Exception as e:
        logger.error(f"Грешка при конвертиране на изображение: {e}")
        return image


# ================== TEXT EXTRACTION ==================

def extract_text_from_pdf(file_path: Path) -> tuple[Optional[str], list[dict]]:
    """
    Извлича текст от PDF по страници с PyMuPDF.

    Returns:
        (full_text, pages_info) — пълен текст и информация per page
    """
    logger.info(f"Извличане на текст от: {file_path}")
    try:
        with fitz.open(file_path) as doc:
            pages_info = []
            all_text = []

            for page_num, page in enumerate(doc):
                page_text = page.get_text(
                    "text",
                    flags=fitz.TEXT_PRESERVE_LIGATURES | fitz.TEXT_PRESERVE_WHITESPACE
                )
                cleaned = clean_text(page_text)
                ratio = calculate_valid_text_ratio(cleaned) if cleaned else 0

                pages_info.append({
                    'page_number': page_num + 1,
                    'raw_length': len(page_text),
                    'clean_length': len(cleaned),
                    'valid_ratio': ratio,
                    'text': cleaned
                })
                all_text.append(page_text)
                logger.debug(f"  Страница {page_num + 1}: {len(cleaned)} символа, ratio={ratio:.2f}")

            full_text = " ".join(all_text)

            # Опитай различни encodings (от ocr_processor.py)
            for encoding in ['utf-8', 'cp1251', 'iso-8859-1', 'windows-1252']:
                try:
                    decoded = full_text.encode(encoding).decode('utf-8')
                    logger.info(f"Декодиране с {encoding} успешно")
                    return clean_text(decoded), pages_info
                except (UnicodeDecodeError, UnicodeEncodeError):
                    continue

            logger.warning(f"Не може да се декодира правилно, връщам суров текст")
            return clean_text(full_text), pages_info

    except Exception as e:
        logger.error(f"Грешка при извличане на текст: {e}")
        return None, []


def text_is_usable(text: str, min_chars: int = 200) -> bool:
    """Проверява дали извлеченият текст е годен за използване."""
    if not text:
        return False
    if len(text.strip()) < min_chars:
        return False
    if is_only_page_numbers(text):
        return False
    if should_use_ocr(text):
        return False
    if calculate_valid_text_ratio(text) < 0.8:
        return False
    return True


# ================== IMAGE EXTRACTION ==================

def extract_images_from_pdf(file_path: Path, output_dir: Path, grayscale: bool = True) -> list[Path]:
    """
    Конвертира PDF в PNG изображения (по 1 на страница).
    Използва pdf2image (Poppler) ако е наличен, иначе fitz fallback.

    Returns:
        Списък с пътища до създадените PNG файлове
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    image_paths = []

    if PDF2IMAGE_AVAILABLE:
        logger.info(f"Конвертиране с pdf2image: {file_path}")
        try:
            images = convert_from_path(file_path)
            for i, image in enumerate(images, 1):
                if grayscale:
                    image = convert_to_optimized_grayscale_png(image)
                filename = f"{file_path.stem}_page_{i}.png"
                save_path = output_dir / filename
                image.save(save_path, "PNG")
                image_paths.append(save_path)
                logger.info(f"  Страница {i} → {save_path}")
            return image_paths
        except Exception as e:
            logger.warning(f"pdf2image неуспешно: {e}, опитвам fitz fallback")

    # Fallback: PyMuPDF rendering
    logger.info(f"Конвертиране с PyMuPDF: {file_path}")
    try:
        with fitz.open(file_path) as doc:
            for page_num, page in enumerate(doc):
                # Render at 200 DPI
                mat = fitz.Matrix(200/72, 200/72)
                pix = page.get_pixmap(matrix=mat)

                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                if grayscale:
                    img = convert_to_optimized_grayscale_png(img)

                filename = f"{file_path.stem}_page_{page_num + 1}.png"
                save_path = output_dir / filename
                img.save(save_path, "PNG")
                image_paths.append(save_path)
                logger.info(f"  Страница {page_num + 1} → {save_path}")
    except Exception as e:
        logger.error(f"Грешка при конвертиране в изображения: {e}")

    return image_paths


# ================== MAIN EXTRACT FUNCTION ==================

def extract_pdf(
    pdf_path: str | Path,
    output_dir: str | Path | None = None,
    mode: str = "text",
    force_images: bool = False,
    min_text_chars: int = 200,
    grayscale: bool = True,
    save_text: bool = True,
    save_metadata: bool = True
) -> ExtractionResult:
    """
    Главна функция — извлича текст и/или изображения от PDF.

    Args:
        pdf_path: Път до PDF файла
        output_dir: Изходна папка (default: до PDF файла)
        mode: "text", "images", "both"
        force_images: Принудително създай изображения дори ако текстът е ОК
        min_text_chars: Минимум символи за годен текст
        grayscale: Конвертирай изображенията в grayscale
        save_text: Запиши текста във файл
        save_metadata: Запиши metadata JSON

    Returns:
        ExtractionResult с пълна информация
    """
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        return ExtractionResult(
            source_file=str(pdf_path), total_pages=0, mode=mode,
            success=False, error=f"Файлът не съществува: {pdf_path}"
        )

    if not pdf_path.suffix.lower() == '.pdf':
        return ExtractionResult(
            source_file=str(pdf_path), total_pages=0, mode=mode,
            success=False, error=f"Не е PDF файл: {pdf_path}"
        )

    # Output directory
    if output_dir is None:
        output_dir = pdf_path.parent / f"{pdf_path.stem}_extracted"
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Get page count
    try:
        with fitz.open(pdf_path) as doc:
            total_pages = len(doc)
    except Exception as e:
        return ExtractionResult(
            source_file=str(pdf_path), total_pages=0, mode=mode,
            success=False, error=f"Не може да се отвори PDF: {e}"
        )

    logger.info(f"PDF: {pdf_path.name} | Страници: {total_pages} | Режим: {mode}")

    result = ExtractionResult(
        source_file=str(pdf_path),
        total_pages=total_pages,
        mode=mode
    )

    # --- TEXT EXTRACTION ---
    need_text = mode in ("text", "both")
    need_images = mode in ("images", "both") or force_images
    text_usable = False

    if need_text or mode == "text":
        full_text, pages_info = extract_text_from_pdf(pdf_path)

        if full_text and text_is_usable(full_text, min_text_chars):
            text_usable = True
            result.full_text = full_text
            result.full_text_length = len(full_text)

            # Per-page results
            for pi in pages_info:
                result.pages.append(PageResult(
                    page_number=pi['page_number'],
                    total_pages=total_pages,
                    has_text=True,
                    text=pi['text'],
                    text_length=pi['clean_length'],
                    valid_text_ratio=pi['valid_ratio'],
                    extraction_method="Direct PDF Extraction"
                ))

            # Save text file
            if save_text:
                text_file = output_dir / f"{pdf_path.stem}_text.txt"
                with open(text_file, 'w', encoding='utf-8') as f:
                    f.write(full_text)
                result.text_file = str(text_file)
                logger.info(f"Текст записан: {text_file} ({len(full_text)} символа)")

                # Per-page text files
                for pi in pages_info:
                    if pi['text'] and len(pi['text']) > 10:
                        page_file = output_dir / f"{pdf_path.stem}_page_{pi['page_number']}_text.txt"
                        with open(page_file, 'w', encoding='utf-8') as f:
                            f.write(pi['text'])
        else:
            logger.warning(f"Текстът не е годен (chars={len(full_text) if full_text else 0}), fallback към images")
            if mode == "text":
                need_images = True  # auto-fallback

    # --- IMAGE EXTRACTION ---
    if need_images or (mode == "text" and not text_usable):
        images_subdir = output_dir / "images"
        image_paths = extract_images_from_pdf(pdf_path, images_subdir, grayscale=grayscale)
        result.images_dir = str(images_subdir)

        # Update/create page results for images
        for img_path in image_paths:
            page_num = int(img_path.stem.split('_page_')[1]) if '_page_' in img_path.stem else 0

            # Find existing page result or create new
            existing = next((p for p in result.pages if p.page_number == page_num), None)
            if existing:
                existing.image_path = str(img_path)
            else:
                result.pages.append(PageResult(
                    page_number=page_num,
                    total_pages=total_pages,
                    has_text=False,
                    image_path=str(img_path),
                    extraction_method="Image Conversion"
                ))

        if not text_usable:
            logger.info(f"Текст не е извлечен — {len(image_paths)} изображения създадени за OCR/AI")

    # Sort pages
    result.pages.sort(key=lambda p: p.page_number)

    # --- METADATA ---
    if save_metadata:
        meta_file = output_dir / f"{pdf_path.stem}_metadata.json"
        meta = {
            "source_file": str(pdf_path),
            "file_size_kb": round(pdf_path.stat().st_size / 1024, 1),
            "total_pages": total_pages,
            "mode": mode,
            "text_extracted": text_usable,
            "text_length": result.full_text_length,
            "images_created": len([p for p in result.pages if p.image_path]),
            "timestamp": result.timestamp,
            "pages": [asdict(p) for p in result.pages]
        }
        with open(meta_file, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        logger.info(f"Metadata записан: {meta_file}")

    logger.info(f"Готово! Текст: {'ДА' if text_usable else 'НЕ'} | "
                f"Изображения: {len([p for p in result.pages if p.image_path])} | "
                f"Изход: {output_dir}")

    return result


# ================== EML SUPPORT ==================

def extract_pdf_from_eml(eml_path: str | Path, output_dir: str | Path | None = None) -> list[Path]:
    """
    Извлича PDF прикачени файлове от EML.

    Returns:
        Списък с пътища до извлечените PDF файлове
    """
    import email

    eml_path = Path(eml_path)
    if output_dir is None:
        output_dir = eml_path.parent
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(eml_path, 'r', encoding='utf-8') as f:
        msg = email.message_from_string(f.read())

    logger.info(f"EML: {eml_path.name}")
    logger.info(f"  From: {msg.get('From', 'N/A')}")
    logger.info(f"  Date: {msg.get('Date', 'N/A')}")
    logger.info(f"  Subject: {msg.get('Subject', 'N/A')}")

    pdf_files = []

    # Extract email body text
    for part in msg.walk():
        ct = part.get_content_type()
        fn = part.get_filename()

        if ct == 'text/plain' and not fn:
            body = part.get_payload(decode=True)
            if body:
                charset = part.get_content_charset() or 'utf-8'
                text = body.decode(charset, errors='replace')
                body_file = output_dir / f"{eml_path.stem}_body.txt"
                with open(body_file, 'w', encoding='utf-8') as bf:
                    bf.write(text)
                logger.info(f"  Body записан: {body_file} ({len(text)} символа)")

        if fn and fn.lower().endswith('.pdf'):
            data = part.get_payload(decode=True)
            if data:
                pdf_path = output_dir / fn
                with open(pdf_path, 'wb') as pf:
                    pf.write(data)
                pdf_files.append(pdf_path)
                logger.info(f"  PDF извлечен: {pdf_path} ({len(data)} bytes)")

    if not pdf_files:
        logger.warning("Няма PDF прикачени файлове в този EML")

    return pdf_files


def process_eml(
    eml_path: str | Path,
    output_dir: str | Path | None = None,
    mode: str = "text",
    **kwargs
) -> list[ExtractionResult]:
    """
    Пълна обработка: EML → извлича PDF-и → извлича текст/изображения.

    Returns:
        Списък с ExtractionResult за всеки PDF
    """
    eml_path = Path(eml_path)
    if output_dir is None:
        output_dir = eml_path.parent / f"{eml_path.stem}_extracted"
    output_dir = Path(output_dir)

    pdf_files = extract_pdf_from_eml(eml_path, output_dir)

    results = []
    for pdf_path in pdf_files:
        pdf_output = output_dir / pdf_path.stem
        result = extract_pdf(pdf_path, pdf_output, mode=mode, **kwargs)
        results.append(result)

    return results


# ================== CLI ==================

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="PDF Extractor — извлича текст и изображения от PDF/EML файлове",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Примери:
  python pdf_extractor.py document.pdf
  python pdf_extractor.py document.pdf --mode both
  python pdf_extractor.py document.pdf --force-images --output-dir ./output
  python pdf_extractor.py email.eml
  python pdf_extractor.py email.eml --mode images
        """
    )

    parser.add_argument('input', help='PDF или EML файл за обработка')
    parser.add_argument('--output-dir', '-o', help='Изходна папка (default: до входния файл)')
    parser.add_argument('--mode', '-m', choices=['text', 'images', 'both'], default='text',
                       help='Режим: text (default), images, both')
    parser.add_argument('--force-images', '-f', action='store_true',
                       help='Създай изображения дори ако текстът е ОК')
    parser.add_argument('--no-grayscale', action='store_true',
                       help='Запази цветните изображения (без grayscale)')
    parser.add_argument('--no-metadata', action='store_true',
                       help='Не записвай metadata JSON')
    parser.add_argument('--min-chars', type=int, default=200,
                       help='Минимум символи за годен текст (default: 200)')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Подробен изход')

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    input_path = Path(args.input)

    if not input_path.exists():
        print(f"ГРЕШКА: Файлът не съществува: {input_path}")
        sys.exit(1)

    output_dir = Path(args.output_dir) if args.output_dir else None

    # EML or PDF?
    if input_path.suffix.lower() == '.eml':
        results = process_eml(
            input_path,
            output_dir=output_dir,
            mode=args.mode,
            force_images=args.force_images,
            grayscale=not args.no_grayscale,
            save_metadata=not args.no_metadata,
            min_text_chars=args.min_chars
        )

        print(f"\n{'='*60}")
        print(f"EML обработен: {input_path.name}")
        print(f"PDF файлове: {len(results)}")
        for r in results:
            print(f"  - {Path(r.source_file).name}: {r.total_pages} pages, "
                  f"text={'YES' if r.full_text else 'NO'}, "
                  f"images={len([p for p in r.pages if p.image_path])}")
        print(f"{'='*60}")

    elif input_path.suffix.lower() == '.pdf':
        result = extract_pdf(
            input_path,
            output_dir=output_dir,
            mode=args.mode,
            force_images=args.force_images,
            grayscale=not args.no_grayscale,
            save_metadata=not args.no_metadata,
            min_text_chars=args.min_chars
        )

        print(f"\n{'='*60}")
        print(f"PDF обработен: {input_path.name}")
        print(f"Страници: {result.total_pages}")
        print(f"Текст: {'ДА' if result.full_text else 'НЕ'} ({result.full_text_length} символа)")
        print(f"Изображения: {len([p for p in result.pages if p.image_path])}")
        if result.text_file:
            print(f"Текст файл: {result.text_file}")
        if result.images_dir:
            print(f"Изображения папка: {result.images_dir}")
        print(f"{'='*60}")

    else:
        print(f"ГРЕШКА: Неподдържан формат: {input_path.suffix}")
        print("Поддържани: .pdf, .eml")
        sys.exit(1)


if __name__ == "__main__":
    main()

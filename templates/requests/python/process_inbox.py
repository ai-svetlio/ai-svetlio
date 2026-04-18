"""
ClientRequests Inbox Processor
==============================
Обработва файлове от inbox/ папката и извлича структурирана информация.

Поддържани формати:
- .eml (стандартен имейл формат, включително с прикачени офис документи)
- .msg (Outlook имейл формат)
- .txt (plain text)
- .md (Markdown)
- .docx, .doc, .xlsx, .xls, .rtf, .xml, .odt (офис документи — чрез office_extractor)

За всеки файл извлича:
- Подател (From)
- Получател (To)
- CC
- Дата
- Тема (Subject)
- Тяло на имейла (Body)
- Прикачени файлове (запазва ги в processed/)
- Teams транскрипти (от DOCX) — структурирано извличане

Генерира структуриран .md файл готов за попълване на шаблона от агент.

Използване:
    python process_inbox.py                 # Обработва всички файлове в inbox/
    python process_inbox.py --watch         # Следи inbox/ за нови файлове
    python process_inbox.py --file "X.eml"  # Обработва конкретен файл
"""

import logging
import os
import sys
import time
import re
import email
import json
import argparse
from email import policy
from email.parser import BytesParser
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Union

# Configure logging
LOG_FILE = Path(__file__).parent / 'process_inbox.log'
logging.basicConfig(
    level=logging.DEBUG,
    filename=str(LOG_FILE),
    filemode='a',
    format='%(asctime)s - %(levelname)s - %(message)s'
)

console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logging.getLogger('').addHandler(console)

# Paths
BASE_DIR = Path(__file__).parent
INBOX_DIR = BASE_DIR / "inbox"
PROCESSED_DIR = BASE_DIR / "processed"
REGISTRY_FILE = BASE_DIR / "REGISTRY.md"
TEMPLATE_FILE = BASE_DIR / "TEMPLATE.md"

# Ensure directories exist
INBOX_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)


class EmailExtractor:
    """Извлича данни от .eml файлове."""

    @staticmethod
    def extract(file_path: Path) -> Dict:
        """Извлича метаданни и тяло от .eml файл."""
        logging.info(f"Извличане на данни от EML: {file_path}")

        with open(file_path, 'rb') as f:
            msg = BytesParser(policy=policy.default).parse(f)

        result = {
            'format': 'eml',
            'from': msg.get('From', ''),
            'to': msg.get('To', ''),
            'cc': msg.get('CC', ''),
            'date': msg.get('Date', ''),
            'subject': msg.get('Subject', ''),
            'body_text': '',
            'body_html': '',
            'attachments': []
        }

        # Parse date
        result['date_parsed'] = EmailExtractor._parse_date(result['date'])

        # Extract body
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get('Content-Disposition', ''))

                # Skip attachments for body extraction
                if 'attachment' in content_disposition:
                    att_info = EmailExtractor._extract_attachment(part)
                    if att_info:
                        result['attachments'].append(att_info)
                    continue

                if content_type == 'text/plain':
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or 'utf-8'
                        try:
                            result['body_text'] = payload.decode(charset, errors='replace')
                        except (LookupError, UnicodeDecodeError):
                            result['body_text'] = payload.decode('utf-8', errors='replace')

                elif content_type == 'text/html':
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or 'utf-8'
                        try:
                            result['body_html'] = payload.decode(charset, errors='replace')
                        except (LookupError, UnicodeDecodeError):
                            result['body_html'] = payload.decode('utf-8', errors='replace')

                elif 'attachment' not in content_disposition and part.get_filename():
                    # Inline attachment
                    att_info = EmailExtractor._extract_attachment(part)
                    if att_info:
                        result['attachments'].append(att_info)
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or 'utf-8'
                try:
                    text = payload.decode(charset, errors='replace')
                except (LookupError, UnicodeDecodeError):
                    text = payload.decode('utf-8', errors='replace')

                if msg.get_content_type() == 'text/html':
                    result['body_html'] = text
                else:
                    result['body_text'] = text

        # Clean body
        result['body_clean'] = EmailExtractor._clean_body(
            result['body_text'] or EmailExtractor._html_to_text(result['body_html'])
        )

        return result

    @staticmethod
    def _extract_attachment(part) -> Optional[Dict]:
        """Извлича информация за прикачен файл."""
        filename = part.get_filename()
        if not filename:
            return None

        data = part.get_payload(decode=True)
        if not data:
            return None

        return {
            'filename': filename,
            'content_type': part.get_content_type(),
            'size': len(data),
            'data': data
        }

    @staticmethod
    def _parse_date(date_str: str) -> str:
        """Парсва дата от имейл хедър."""
        if not date_str:
            return datetime.now().strftime('%Y-%m-%d %H:%M')

        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(date_str)
            return dt.strftime('%Y-%m-%d %H:%M')
        except Exception:
            return date_str

    @staticmethod
    def _clean_body(body: str) -> str:
        """Почиства тялото на имейла."""
        if not body:
            return ''

        # Remove URLs
        body = re.sub(r'http\S+', '', body)
        # Remove HTML tags
        body = re.sub(r'<[^>]+>', '', body)
        # Remove multiple empty lines
        body = re.sub(r'\n\s*\n\s*\n', '\n\n', body)
        # Strip lines
        body = '\n'.join(line.strip() for line in body.splitlines())
        # Strip overall
        body = body.strip()

        return body

    @staticmethod
    def _html_to_text(html: str) -> str:
        """Конвертира HTML към plain text."""
        if not html:
            return ''
        # Remove tags
        text = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
        text = re.sub(r'<p[^>]*>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</p>', '', text, flags=re.IGNORECASE)
        text = re.sub(r'<[^>]+>', '', text)
        # Decode HTML entities
        import html as html_module
        text = html_module.unescape(text)
        return text.strip()


class MsgExtractor:
    """Извлича данни от .msg файлове (Outlook формат)."""

    @staticmethod
    def extract(file_path: Path) -> Dict:
        """Извлича метаданни и тяло от .msg файл."""
        logging.info(f"Извличане на данни от MSG: {file_path}")

        try:
            import extract_msg
        except ImportError:
            logging.error("extract_msg не е инсталиран. Инсталирай с: pip install extract-msg")
            return MsgExtractor._fallback_result(file_path)

        result = {
            'format': 'msg',
            'from': '',
            'to': '',
            'cc': '',
            'date': '',
            'subject': '',
            'body_text': '',
            'body_html': '',
            'body_clean': '',
            'attachments': []
        }

        try:
            with extract_msg.Message(str(file_path)) as msg:
                result['from'] = str(msg.sender or '')
                result['to'] = str(msg.to or '')
                result['cc'] = str(msg.cc or '')
                result['date'] = str(msg.date or '')
                result['subject'] = str(msg.subject or '')
                result['body_text'] = str(msg.body or '')

                # Parse date
                result['date_parsed'] = EmailExtractor._parse_date(result['date'])

                # Clean body
                result['body_clean'] = EmailExtractor._clean_body(result['body_text'])

                # Extract attachments
                for i, attachment in enumerate(msg.attachments):
                    # Skip inline images
                    if hasattr(attachment, 'cid') and attachment.cid:
                        continue

                    filename = attachment.longFilename or attachment.shortFilename or f"attachment_{i+1}"
                    ext = Path(filename).suffix.lower()

                    # Skip inline signature images
                    if ext in ['.png', '.jpg', '.jpeg', '.gif'] and not attachment.longFilename:
                        continue

                    data = None
                    if hasattr(attachment, 'data') and attachment.data:
                        if isinstance(attachment.data, bytes):
                            data = attachment.data
                        elif isinstance(attachment.data, str):
                            data = attachment.data.encode('utf-8')

                    if data:
                        result['attachments'].append({
                            'filename': filename,
                            'content_type': '',
                            'size': len(data),
                            'data': data
                        })

        except Exception as e:
            logging.error(f"Грешка при обработка на MSG файл {file_path}: {e}")

        return result

    @staticmethod
    def _fallback_result(file_path: Path) -> Dict:
        return {
            'format': 'msg',
            'from': '',
            'to': '',
            'cc': '',
            'date': '',
            'date_parsed': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'subject': file_path.stem,
            'body_text': f'[MSG файл не може да се прочете: {file_path.name}]',
            'body_html': '',
            'body_clean': f'[MSG файл не може да се прочете: {file_path.name}]',
            'attachments': []
        }


class TextExtractor:
    """Извлича данни от .txt и .md файлове."""

    @staticmethod
    def extract(file_path: Path) -> Dict:
        """Извлича съдържание от текстов файл."""
        logging.info(f"Извличане на данни от текстов файл: {file_path}")

        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

        return {
            'format': 'text',
            'from': TextExtractor._guess_from(content),
            'to': '',
            'cc': '',
            'date': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'date_parsed': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'subject': file_path.stem,
            'body_text': content,
            'body_html': '',
            'body_clean': content.strip(),
            'attachments': []
        }

    @staticmethod
    def _guess_from(content: str) -> str:
        """Опитва се да извлече подател от съдържанието."""
        # Look for common patterns
        patterns = [
            r'(?:From|От|Подател):\s*(.+)',
            r'(?:Изпратено от|Sent by):\s*(.+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return ''


class OfficeExtractorBridge:
    """Мост към office_extractor.py за офис документи."""

    # Офис формати, които се обработват от office_extractor
    OFFICE_EXTENSIONS = {'.docx', '.doc', '.xlsx', '.xls', '.rtf', '.xml', '.odt'}

    @staticmethod
    def is_office_format(file_path: Path) -> bool:
        """Проверява дали файлът е офис документ."""
        return file_path.suffix.lower() in OfficeExtractorBridge.OFFICE_EXTENSIONS

    @staticmethod
    def extract(file_path: Path) -> Dict:
        """Извлича данни от офис документ чрез office_extractor."""
        logging.info(f"Извличане от офис документ: {file_path}")

        try:
            from office_extractor import OfficeDocumentProcessor
            processor = OfficeDocumentProcessor()
            result = processor.process_file(file_path)

            if not result:
                return OfficeExtractorBridge._fallback_result(file_path)

            # Конвертираме към стандартния формат на process_inbox
            extracted = {
                'format': result.get('format', file_path.suffix.lower().lstrip('.')),
                'from': '',
                'to': '',
                'cc': '',
                'date': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'date_parsed': datetime.now().strftime('%Y-%m-%d %H:%M'),
                'subject': file_path.stem,
                'body_text': result.get('extracted_text', ''),
                'body_html': '',
                'body_clean': result.get('extracted_text', ''),
                'attachments': [],
                'is_teams_transcript': result.get('is_teams_transcript', False),
            }

            # Ако е Teams транскрипт — обогатяваме
            if result.get('teams_data'):
                td = result['teams_data']
                extracted['subject'] = td.get('title', file_path.stem)
                extracted['date'] = td.get('date', '')
                participants = td.get('participants', [])
                extracted['from'] = ', '.join(participants) if participants else ''
                extracted['teams_data'] = td

            # Ако е от EML — добавяме метаданни
            if result.get('eml_metadata'):
                meta = result['eml_metadata']
                extracted['from'] = meta.get('from', extracted['from'])
                extracted['to'] = meta.get('to', '')
                extracted['cc'] = meta.get('cc', '')
                extracted['subject'] = meta.get('subject', extracted['subject'])

            return extracted

        except ImportError:
            logging.warning("office_extractor.py не е достъпен. Опит с текстов извличане...")
            return OfficeExtractorBridge._fallback_result(file_path)
        except Exception as e:
            logging.error(f"Грешка при офис извличане от {file_path}: {e}")
            return OfficeExtractorBridge._fallback_result(file_path)

    @staticmethod
    def _fallback_result(file_path: Path) -> Dict:
        return {
            'format': file_path.suffix.lower().lstrip('.'),
            'from': '',
            'to': '',
            'cc': '',
            'date': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'date_parsed': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'subject': file_path.stem,
            'body_text': f'[Офис документ не може да се обработи: {file_path.name}]',
            'body_html': '',
            'body_clean': f'[Офис документ не може да се обработи: {file_path.name}]',
            'attachments': []
        }


class InboxProcessor:
    """Основен процесор за inbox/ папката."""

    EXTRACTORS = {
        '.eml': EmailExtractor.extract,
        '.msg': MsgExtractor.extract,
        '.txt': TextExtractor.extract,
        '.md': TextExtractor.extract,
        # Офис формати
        '.docx': OfficeExtractorBridge.extract,
        '.doc': OfficeExtractorBridge.extract,
        '.xlsx': OfficeExtractorBridge.extract,
        '.xls': OfficeExtractorBridge.extract,
        '.rtf': OfficeExtractorBridge.extract,
        '.xml': OfficeExtractorBridge.extract,
        '.odt': OfficeExtractorBridge.extract,
    }

    def __init__(self):
        self.processed_count = 0

    def process_all(self) -> List[Dict]:
        """Обработва всички файлове в inbox/."""
        results = []

        files = sorted(INBOX_DIR.iterdir())
        if not files:
            logging.info("inbox/ е празна. Няма файлове за обработка.")
            return results

        for file_path in files:
            if file_path.is_file():
                result = self.process_file(file_path)
                if result:
                    results.append(result)

        logging.info(f"Обработени {len(results)} файла от inbox/")
        return results

    def process_file(self, file_path: Path) -> Optional[Dict]:
        """Обработва един файл от inbox/."""
        ext = file_path.suffix.lower()

        extractor = self.EXTRACTORS.get(ext)
        if not extractor:
            logging.warning(f"Неподдържан формат: {ext} ({file_path.name})")
            return None

        try:
            data = extractor(file_path)
            data['source_file'] = file_path.name
            data['source_path'] = str(file_path)

            # Save extracted data as JSON
            json_path = PROCESSED_DIR / f"{file_path.stem}_extracted.json"
            json_data = {k: v for k, v in data.items() if k != 'attachments'}
            json_data['attachment_count'] = len(data.get('attachments', []))
            json_data['attachment_names'] = [a['filename'] for a in data.get('attachments', [])]

            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2)
            logging.info(f"Записани извлечени данни: {json_path}")

            # Save attachments
            for att in data.get('attachments', []):
                att_path = PROCESSED_DIR / f"{file_path.stem}_att_{att['filename']}"
                with open(att_path, 'wb') as f:
                    f.write(att['data'])
                logging.info(f"Записан прикачен файл: {att_path}")

            # Save clean body as .txt for easy reading
            body_path = PROCESSED_DIR / f"{file_path.stem}_body.txt"
            with open(body_path, 'w', encoding='utf-8') as f:
                f.write(f"От: {data.get('from', '')}\n")
                f.write(f"До: {data.get('to', '')}\n")
                if data.get('cc'):
                    f.write(f"CC: {data['cc']}\n")
                f.write(f"Дата: {data.get('date_parsed', data.get('date', ''))}\n")
                f.write(f"Тема: {data.get('subject', '')}\n")
                f.write(f"Прикачени: {len(data.get('attachments', []))} файла\n")
                f.write(f"\n{'='*60}\n\n")
                f.write(data.get('body_clean', ''))
            logging.info(f"Записано тяло: {body_path}")

            # Move original to processed (ако не е вече там)
            if file_path.parent != PROCESSED_DIR:
                dest = PROCESSED_DIR / file_path.name
                if dest.exists():
                    # Add timestamp to avoid overwrite
                    stem = file_path.stem
                    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                    dest = PROCESSED_DIR / f"{stem}_{ts}{file_path.suffix}"

                file_path.rename(dest)
                logging.info(f"Преместен оригинал: {file_path} -> {dest}")
            else:
                logging.info(f"Файлът вече е в processed/: {file_path}")

            self.processed_count += 1
            return data

        except Exception as e:
            logging.error(f"Грешка при обработка на {file_path}: {e}")
            import traceback
            logging.error(traceback.format_exc())
            return None

    def watch(self):
        """Следи inbox/ за нови файлове (Watchdog)."""
        try:
            from watchdog.observers import Observer
            from watchdog.events import FileSystemEventHandler
        except ImportError:
            logging.error("watchdog не е инсталиран. Инсталирай с: pip install watchdog")
            logging.info("Преминаване към poll mode (проверка на всеки 10 секунди)...")
            self._poll_watch()
            return

        class InboxHandler(FileSystemEventHandler):
            def __init__(self, processor):
                self.processor = processor

            def on_created(self, event):
                if not event.is_directory:
                    file_path = Path(event.src_path)
                    # Wait for file to be fully written
                    time.sleep(2)
                    if file_path.exists():
                        logging.info(f"Нов файл открит: {file_path.name}")
                        self.processor.process_file(file_path)

        handler = InboxHandler(self)
        observer = Observer()
        observer.schedule(handler, str(INBOX_DIR), recursive=False)
        observer.start()

        logging.info(f"Следене на inbox/ за нови файлове... (Ctrl+C за спиране)")

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            logging.info("Спиране на наблюдението...")
            observer.stop()
            observer.join()

    def _poll_watch(self):
        """Fallback: проверка на inbox/ на всеки 10 секунди."""
        logging.info("Poll mode: проверка на inbox/ на всеки 10 секунди...")
        seen_files = set()

        try:
            while True:
                for file_path in INBOX_DIR.iterdir():
                    if file_path.is_file() and file_path.name not in seen_files:
                        seen_files.add(file_path.name)
                        time.sleep(2)  # Wait for file to be fully written
                        if file_path.exists():
                            self.process_file(file_path)
                time.sleep(10)
        except KeyboardInterrupt:
            logging.info("Спиране на наблюдението...")


def print_summary(data: Dict):
    """Показва резюме на извлечените данни."""
    print(f"\n{'='*60}")
    print(f"  Файл:    {data.get('source_file', '')}")
    print(f"  Формат:  {data.get('format', '')}")
    print(f"  От:      {data.get('from', '')}")
    print(f"  До:      {data.get('to', '')}")
    if data.get('cc'):
        print(f"  CC:      {data['cc']}")
    print(f"  Дата:    {data.get('date_parsed', data.get('date', ''))}")
    print(f"  Тема:    {data.get('subject', '')}")
    print(f"  Тяло:    {len(data.get('body_clean', ''))} символа")
    print(f"  Прикач.: {len(data.get('attachments', []))} файла")

    if data.get('attachments'):
        for att in data['attachments']:
            print(f"           - {att['filename']} ({att['size']} bytes)")

    print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(description='ClientRequests Inbox Processor')
    parser.add_argument('--watch', action='store_true', help='Следи inbox/ за нови файлове')
    parser.add_argument('--file', type=str, help='Обработи конкретен файл')
    args = parser.parse_args()

    processor = InboxProcessor()

    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            file_path = INBOX_DIR / args.file
        if not file_path.exists():
            print(f"Файлът не съществува: {args.file}")
            sys.exit(1)

        result = processor.process_file(file_path)
        if result:
            print_summary(result)
        else:
            print("Грешка при обработка на файла.")
            sys.exit(1)

    elif args.watch:
        processor.watch()

    else:
        results = processor.process_all()
        if results:
            for result in results:
                print_summary(result)
            print(f"Общо обработени: {len(results)} файла")
            print(f"Извлечените данни са в: {PROCESSED_DIR}")
        else:
            print("Няма файлове за обработка в inbox/")


if __name__ == '__main__':
    main()

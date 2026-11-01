import os
import sys
import shutil
import subprocess
import urllib.request
import zipfile
import copy
import plistlib

import json

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

ELECTRON_VERSION = "v45.1.0"
APP_DISPLAY_NAME = "Bubu & Dudu Pet"
APP_BUNDLE_FOLDER = "Bubu & Dudu Pet.app"
APP_EXEC_NAME = "BubuAndDuduPet"
BUNDLE_ID = "com.bubududu.desktoppet"

with open(os.path.join(PROJECT_ROOT, "package.json"), "r", encoding="utf-8") as _fp:
    VERSION = json.load(_fp).get("version", "1.0.3")

MAC_README_TEXT = f"""# วิธีเปิดใช้งาน Bubu & Dudu Pet บน macOS (Sonoma 14+ / Ventura / Monterey)

เนื่องจากแอปพลิเคชันนี้ไม่ได้ผ่านการเซ็นชื่อด้วย Apple Developer ID ($99/ปี) 
macOS Sonoma จะบล็อกการเปิดแอปเป็นค่าเริ่มต้น (ขึ้นว่า "แอปเสียหาย / Damaged" หรือ "ไม่สามารถเปิดได้")

### วิธีเปิดใช้งานง่ายๆ (ทำเพียงครั้งแรกครั้งเดียว):

วิธีที่ 1 (แนะนำ - รวดเร็วที่สุด):
1. เปิดโปรแกรม **Terminal** (กด Cmd + Space แล้วพิมพ์ Terminal แล้วกด Enter)
2. พิมพ์คำสั่งนี้ (หรือคัดลอกไปวาง):
   xattr -cr "/Applications/{APP_BUNDLE_FOLDER}"
   (หรือหากไฟล์อยู่ในโฟลเดอร์ Downloads ให้พิมพ์: xattr -cr ~/Downloads/"{APP_BUNDLE_FOLDER}")
   เคล็ดลับ: พิมพ์ `xattr -cr ` แล้วลากตัวแอป {APP_BUNDLE_FOLDER} มาวางในหน้าต่าง Terminal แล้วกด Enter ได้เลย!
3. ดับเบิ้ลคลิกเปิดแอป {APP_BUNDLE_FOLDER} ได้ทันที!

วิธีที่ 2 (ผ่าน System Settings):
1. ดับเบิ้ลคลิกเปิดแอป 1 ครั้ง (ถ้ามีแจ้งเตือนให้กด Cancel หรือปิดไป)
2. ไปที่ **System Settings** (การตั้งค่าระบบ) บน Mac
3. เลือกเมนู **Privacy & Security** (ความเป็นส่วนตัวและความปลอดภัย)
4. เลื่อนลงมาด้านล่างที่หัวข้อ **Security** (ความปลอดภัย)
5. จะเห็นข้อความแจ้งว่า "{APP_BUNDLE_FOLDER} was blocked" ให้คลิกปุ่ม **"Open Anyway"** (เปิดต่อไป)
6. ใส่รหัสผ่านเครื่อง Mac หรือสแกน Touch ID แล้วกด **Open**

---
หมายเหตุสำหรับผู้ใช้ MacBook Pro 2020:
- หากเครื่องใช้ชิป Intel Core i5 / i7: ให้ใช้ไฟล์เวอร์ชัน **x64**
- หากเครื่องใช้ชิป Apple Silicon M1: ให้ใช้ไฟล์เวอร์ชัน **arm64**
(ตรวจสอบได้ที่ เมนู  (รูปแอปเปิ้ลมุมซ้ายบน) > About This Mac / เกี่ยวกับ Mac เครื่องนี้)
"""

def ensure_dirs():
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(DIST_DIR, exist_ok=True)

def build_asar():
    staging = os.path.join(CACHE_DIR, "staging_app")
    if os.path.exists(staging):
        shutil.rmtree(staging)
    os.makedirs(staging)

    # Copy package.json
    shutil.copy(os.path.join(PROJECT_ROOT, "package.json"), staging)
    # Copy src/
    shutil.copytree(os.path.join(PROJECT_ROOT, "src"), os.path.join(staging, "src"))

    # Copy assets
    for f in os.listdir(PROJECT_ROOT):
        if f.endswith(".gif") or f in ["tray-icon.png", "app-icon.png", "app-icon.ico"]:
            shutil.copy(os.path.join(PROJECT_ROOT, f), staging)

    asar_out = os.path.join(CACHE_DIR, "app.asar")
    print("Packaging app.asar...")
    cmd = f'npx @electron/asar pack "{staging}" "{asar_out}"'
    subprocess.run(cmd, shell=True, check=True)
    print(f"app.asar created successfully ({os.path.getsize(asar_out)} bytes)")
    return asar_out

def download_electron_zip(arch):
    filename = f"electron-{ELECTRON_VERSION}-darwin-{arch}.zip"
    dest = os.path.join(CACHE_DIR, filename)
    if os.path.exists(dest) and os.path.getsize(dest) > 10000000:
        print(f"Using cached {filename}...")
        return dest

    url = f"https://github.com/electron/electron/releases/download/{ELECTRON_VERSION}/{filename}"
    print(f"Downloading {url} ...")

    def report_hook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = downloaded * 100 / total_size
            if block_num % 500 == 0:
                print(f"Progress: {percent:.1f}% ({downloaded / 1024 / 1024:.1f} MB)", flush=True)

    urllib.request.urlretrieve(url, dest, reporthook=report_hook)
    print(f"Downloaded {filename} ({os.path.getsize(dest)} bytes)")
    return dest

def package_mac_zip(arch):
    zip_source = download_electron_zip(arch)
    asar_path = os.path.join(CACHE_DIR, "app.asar")
    icns_path = os.path.join(PROJECT_ROOT, "app-icon.icns")

    out_zip = os.path.join(DIST_DIR, f"Bubu & Dudu Pet-{VERSION}-mac-{arch}.zip")
    print(f"Assembling macOS application into {out_zip} ...")

    with open(asar_path, "rb") as f:
        asar_bytes = f.read()

    icns_bytes = None
    if os.path.exists(icns_path):
        with open(icns_path, "rb") as f:
            icns_bytes = f.read()

    with zipfile.ZipFile(zip_source, "r") as zin, zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            orig_name = item.filename

            # Map Electron.app -> "Bubu & Dudu Pet.app"
            new_name = orig_name.replace("Electron.app/", f"{APP_BUNDLE_FOLDER}/")

            # Map main executable: Contents/MacOS/Electron -> Contents/MacOS/BubuAndDuduPet
            if new_name == f"{APP_BUNDLE_FOLDER}/Contents/MacOS/Electron":
                new_name = f"{APP_BUNDLE_FOLDER}/Contents/MacOS/{APP_EXEC_NAME}"

            # Skip default_app.asar
            if "default_app.asar" in orig_name:
                continue

            content = zin.read(orig_name)

            # Update main Info.plist using plistlib (guarantees valid XML & escapes entities like &amp;)
            if orig_name == "Electron.app/Contents/Info.plist":
                plist_data = plistlib.loads(content)
                plist_data['CFBundleDisplayName'] = APP_DISPLAY_NAME
                plist_data['CFBundleName'] = APP_DISPLAY_NAME
                plist_data['CFBundleExecutable'] = APP_EXEC_NAME
                plist_data['CFBundleIdentifier'] = BUNDLE_ID
                plist_data['CFBundleShortVersionString'] = VERSION
                plist_data['CFBundleVersion'] = VERSION

                # Remove ElectronAsarIntegrity so Electron doesn't look for default_app.asar hash
                if 'ElectronAsarIntegrity' in plist_data:
                    del plist_data['ElectronAsarIntegrity']

                content = plistlib.dumps(plist_data)

            # Update electron.icns with custom app-icon.icns
            if orig_name.endswith("Contents/Resources/electron.icns") and icns_bytes:
                content = icns_bytes

            # Crucial: Deep copy item and FORCE create_system = 3 (UNIX)
            # This ensures macOS unzip and Archive Utility properly restore execution permissions (chmod +x)
            # and framework symbolic links!
            item_out = copy.deepcopy(item)
            item_out.filename = new_name
            item_out.create_system = 3  # 3 = UNIX

            # Ensure main binary has executable permission 0o100755
            if new_name == f"{APP_BUNDLE_FOLDER}/Contents/MacOS/{APP_EXEC_NAME}":
                item_out.external_attr = 0o100755 << 16

            zout.writestr(item_out, content)

        # Inject our app.asar into Contents/Resources/app.asar with UNIX permissions
        app_asar_entry = zipfile.ZipInfo(f"{APP_BUNDLE_FOLDER}/Contents/Resources/app.asar")
        app_asar_entry.create_system = 3
        app_asar_entry.compress_type = zipfile.ZIP_DEFLATED
        app_asar_entry.external_attr = 0o100644 << 16
        zout.writestr(app_asar_entry, asar_bytes)

        # Also add a helpful README text inside the zip
        readme_entry = zipfile.ZipInfo("HOW_TO_OPEN_MAC.txt")
        readme_entry.create_system = 3
        readme_entry.compress_type = zipfile.ZIP_DEFLATED
        readme_entry.external_attr = 0o100644 << 16
        zout.writestr(readme_entry, MAC_README_TEXT.encode("utf-8"))

    print(f"Successfully created macOS package: {out_zip} ({os.path.getsize(out_zip) / 1024 / 1024:.1f} MB)")

if __name__ == "__main__":
    ensure_dirs()
    build_asar()
    target_arch = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target_arch in ["arm64", "all"]:
        print("\n--- Building macOS ARM64 (Apple Silicon M1/M2/M3/M4) ---")
        package_mac_zip("arm64")
    if target_arch in ["x64", "all"]:
        print("\n--- Building macOS x64 (Intel Core i5/i7) ---")
        package_mac_zip("x64")

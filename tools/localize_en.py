import os
import sys

def update_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    applied = 0
    for src, dst in replacements:
        if src in content:
            content = content.replace(src, dst)
            applied += 1
        else:
            print(f"[{os.path.basename(filepath)}] WARNING: Target not found: {src[:40]}")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"[{os.path.basename(filepath)}] Applied {applied}/{len(replacements)} replacements.")

def main():
    # 1. Update src/main.js
    main_replacements = [
        ("name: 'สตรอว์เบอร์รี่สด'", "name: 'Fresh Strawberry'"),
        ("name: 'ชานมไข่มุกหวานละมุน'", "name: 'Bubble Milk Tea'"),
        ("name: 'เค้กช็อกโกแลตสตรอว์เบอร์รี่'", "name: 'Strawberry Cake'"),
        ("name: 'ข้าวปั้นโอนิกิริ'", "name: 'Onigiri Rice Ball'"),
        ("name: 'น่องไก่ทอดกรอบ'", "name: 'Crispy Chicken Drumstick'"),
        ("name: 'พิซซ่าชีสเยิ้ม'", "name: 'Cheesy Pizza Slice'"),
        ("(+${item.hunger} หิว)", "(+${item.hunger} hunger)"),
        ("⭐ มีอัปเดตใหม่: ${updateInfo.latestVersion} (คลิกเพื่อติดตั้ง)", "⭐ New Update Available: ${updateInfo.latestVersion} (Click to Install)"),
        ("label: 'ให้อาหารน้อง Bubu 🍓'", "label: 'Feed Bubu 🍓'"),
        ("label: 'ให้อาหารน้อง Dudu 🍗'", "label: 'Feed Dudu 🍗'"),
        ("label: 'ให้น้องนอนพัก 5 นาที 💤'", "label: 'Take a 5-min Nap 💤'"),
        ("label: 'ปลุกน้องทั้งสอง ⏰'", "label: 'Wake Up Both Pets ⏰'"),
        ("label: 'ตรวจหาอัปเดต... (Check for Updates 🔄)'", "label: 'Check for Updates 🔄'"),
        ("label: 'ตั้งค่า GitHub Token 🔑'", "label: 'Configure GitHub Token 🔑'"),
        ("'💤 กำลังหลับสบาย' : (stats.hunger < 35 ? '🥺 หิวงับ' : '✨ ร่าเริง')", "'💤 Sleeping peacefully' : (stats.hunger < 35 ? '🥺 Hungry' : '✨ Happy')"),
        ("label: `ให้อาหาร (${isBubu ? 'Feed Bubu' : 'Feed Dudu'} 🍽️)`", "label: `Feed Pet (${isBubu ? 'Feed Bubu' : 'Feed Dudu'} 🍽️)`"),
        ("label: 'ปลุกน้อง ⏰'", "label: 'Wake Up ⏰'"),
        ("⭐ มีอัปเดตใหม่ ${status.latestVersion}! คลิกที่ไอคอนถาดระบบเพื่ออัปเดตได้เลย ✨", "⭐ New update ${status.latestVersion} available! Click tray icon to update ✨"),
        ("⭐ มีอัปเดตใหม่ ${status.latestVersion}! ✨", "⭐ New update ${status.latestVersion} available! ✨")
    ]
    update_file('src/main.js', main_replacements)

    # 2. Update src/pet.js
    pet_replacements = [
        ("✨ ตื่นแล้ว! หลับเต็มอิ่ม (พลัง 100% ⚡)", "✨ Wide awake! Fully refreshed (Energy 100% ⚡)"),
        ("💤 ง่วงนอนแล้วจ้า... ขอหลับแป๊บนึงน้า", "💤 So sleepy... Time for a little nap 😴"),
        ("💤 พลังงานหมดแล้ว...ของีบสัก 5 นาทีนะ", "💤 Out of energy... Taking a 5-min nap 😴"),
        ("หิวม๊ากกก 🍙 หิวจนตาลายแย้ว~", "So hungry... 🍙 Tummy is rumbling~"),
        ("อร่อยจัง!", "Yummy!"),
        ("อื้ออ... โดนสะกิดตื่นเยย 😴", "Mmm... Did someone poke me awake? 😴"),
        ("งั่มๆ ได้กลิ่น ${name}! ตื่นมากินก่อน 😋", "Yum! Smelled ${name}! Woke up to eat 😋"),
        ("งั่มๆ ${name} อร่อยมาก! (อิ่ม ${Math.round(petStats.hunger)}%)", "Nom nom, ${name} is delicious! (Full: ${Math.round(petStats.hunger)}%)"),
        ("['🍙 ข้าวปั้น', '🧋 ชานมไข่มุก', '🍓 สตรอว์เบอร์รี่', '🍰 เค้กหวานๆ', '🍗 น่องไก่', '🍕 พิซซ่า']",
         "['🍙 Onigiri', '🧋 Bubble Tea', '🍓 Strawberry', '🍰 Sweet Cake', '🍗 Chicken Drumstick', '🍕 Pizza']"),
        ("💭 หิวจังเลย อยากกิน${craving}~", "💭 Hungry... Craving ${craving}~"),
        ("💤 ขอตัวไปนอนพักสัก 5 นาทีนะงับ...", "💤 Taking a cozy 5-minute nap... 😴"),
        ("ตื่นแล้วค้าบบบ! ☀️", "Good morning! I'm awake! ☀️")
    ]
    update_file('src/pet.js', pet_replacements)

    # 3. Update src/updater.js
    updater_replacements = [
        ("message: `คุณกำลังใช้เวอร์ชันล่าสุดแล้ว! (v${currentVersion})`", "message: `You are on the latest version! (v${currentVersion})`"),
        ("detail: 'น้องๆ Bubu และ Dudu สดชื่นและพร้อมเล่นอยู่เสมอ ไม่มีอัปเดตใหม่ในขณะนี้ ✨'", "detail: 'Bubu & Dudu are fresh, happy, and ready to play! No updates needed ✨'"),
        ("buttons: ['ตกลง']", "buttons: ['OK']"),
        ("message: 'Repository นี้เป็นแบบส่วนตัว (Private)'", "message: 'Private GitHub Repository'"),
        ("detail: 'ไม่สามารถเข้าถึง GitHub Release ได้เนื่องจากยังไม่ได้ระบุ GitHub Token หรือ Token หมดอายุ\\n\\nต้องการตั้งค่า GitHub Token ตอนนี้หรือไม่?'",
         "detail: 'Unable to access GitHub Releases because no GitHub Token is configured or the token has expired.\\n\\nWould you like to configure your GitHub Token now?'"),
        ("buttons: ['ตั้งค่า Token 🔑', 'ไว้ภายหลัง']", "buttons: ['Configure Token 🔑', 'Later']"),
        ("message: 'ไม่สามารถตรวจสอบการอัปเดตได้ในขณะนี้'", "message: 'Unable to check for updates at this time'"),
        ("detail: `ข้อผิดพลาด: ${err.message}\\n(ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต หรือลองใหม่อีกครั้งในภายหลัง)`",
         "detail: `Error: ${err.message}\\n(Please check your network connection or try again later)`"),
        ("const notes = (release.body || 'มีการปรับปรุงและเพิ่มฟีเจอร์ใหม่').slice(0, 500);",
         "const notes = (release.body || 'New features and improvements').slice(0, 500);"),
        ("title: '🎉 พบอัปเดตใหม่สำหรับ Bubu & Dudu Pet!'", "title: '🎉 New Update Available for Bubu & Dudu Pet!'"),
        ("message: `เวอร์ชันใหม่ ${tag} พร้อมให้ใช้งานแล้ว! (เวอร์ชันปัจจุบัน: v${currentVersion})`",
         "message: `New version ${tag} is ready! (Current version: v${currentVersion})`"),
        ("detail: `${notes}\\n\\nต้องการดาวน์โหลดและติดตั้งทันทีหรือไม่?`",
         "detail: `${notes}\\n\\nWould you like to download and install now?`"),
        ("buttons: ['ดาวน์โหลดและอัปเดต 📥', 'เปิดดูบน GitHub 🌐', 'ไว้ภายหลัง ❌']",
         "buttons: ['Download & Update 📥', 'View on GitHub 🌐', 'Later ❌']"),
        ("const masked = currentToken ? (currentToken.slice(0, 7) + '...' + currentToken.slice(-4)) : 'ยังไม่ได้ตั้งค่า';",
         "const masked = currentToken ? (currentToken.slice(0, 7) + '...' + currentToken.slice(-4)) : 'Not configured';"),
        ("title: 'ตั้งค่า GitHub Token สำหรับ Auto-Update 🔑'", "title: 'Configure GitHub Token for Auto-Updates 🔑'"),
        ("message: `สถานะ Token ปัจจุบัน: ${masked}`", "message: `Current Token Status: ${masked}`"),
        ("detail: `ระบบรองรับการอ่าน Token อัตโนมัติจาก:\\n1. ไฟล์ updater.config.json\\n2. ตัวแปรสภาพแวดล้อม GITHUB_TOKEN\\n\\nต้องการเปิดโฟลเดอร์ตั้งค่าเพื่อตรวจสอบ/แก้ไขไฟล์ updater.config.json หรือไม่?`",
         "detail: `The system automatically loads tokens from:\\n1. updater.config.json in app directory\\n2. GITHUB_TOKEN environment variable\\n\\nWould you like to open the configuration folder or generate a token on GitHub?`"),
        ("buttons: ['เปิดโฟลเดอร์ตั้งค่า 📁', 'เปิดหน้าสร้าง Token บน GitHub 🌐', 'ปิด']",
         "buttons: ['Open Config Folder 📁', 'Generate Token on GitHub 🌐', 'Close']"),
        ("title: 'กำลังดาวน์โหลดอัปเดต 📥'", "title: 'Downloading Update 📥'"),
        ("message: `กำลังดาวน์โหลด ${asset.name}...`", "message: `Downloading ${asset.name}...`"),
        ("detail: 'ระบบกำลังดาวน์โหลดไฟล์อัปเดตในเบื้องหลัง เมื่อเสร็จสิ้นจะเปิดตัวติดตั้งให้อัตโนมัติครับ ✨'",
         "detail: 'Downloading update in background. The installer will launch automatically once finished ✨'"),
        ("buttons: ['รับทราบ']", "buttons: ['OK']"),
        ("title: 'ดาวน์โหลดเสร็จสมบูรณ์ 🎉'", "title: 'Download Complete 🎉'"),
        ("message: 'ดาวน์โหลดเวอร์ชันใหม่เสร็จแล้ว พร้อมติดตั้งทันที!'",
         "message: 'New version downloaded successfully and ready to install!'"),
        ("buttons: ['ติดตั้งและเริ่มแอปใหม่ 🚀', 'ไว้เปิดเองภายหลัง']",
         "buttons: ['Install & Restart 🚀', 'Later']"),
        ("message: 'ดาวน์โหลดเวอร์ชันใหม่เสร็จแล้ว!'", "message: 'New version downloaded successfully!'"),
        ("detail: `ไฟล์อยู่ที่: ${destPath}\\nเปิดไฟล์เพื่อแทนที่แอปในโฟลเดอร์ Applications ได้ทันที ✨`",
         "detail: `File saved at: ${destPath}\\nOpen file to replace app in Applications folder ✨`"),
        ("title: 'การดาวน์โหลดล้มเหลว'", "title: 'Download Failed'"),
        ("message: 'ไม่สามารถดาวน์โหลดไฟล์อัปเดตได้'", "message: 'Unable to download update file'"),
        ("detail: `${err.message}\\nจะเปิดหน้าดาวน์โหลด Release บนเบราว์เซอร์แทนครับ`",
         "detail: `${err.message}\\nOpening release page in browser instead.`")
    ]
    update_file('src/updater.js', updater_replacements)

if __name__ == '__main__':
    main()

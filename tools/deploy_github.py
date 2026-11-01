import os
import sys
import json
import base64
import urllib.request
import urllib.parse
import urllib.error

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST_DIR = os.path.join(PROJECT_ROOT, "dist")

IGNORED_DIRS = {
    "node_modules", "dist", "build", ".agents", ".git", 
    "tools/cache", "tools/frames", "__pycache__", "test/fixtures"
}
IGNORED_EXTENSIONS = {".log", ".tmp"}
IGNORED_FILES = {".DS_Store", "Thumbs.db", "Desktop.ini", "updater.config.json", ".env", ".env.local"}

def should_ignore(rel_path):
    rel_path_fwd = rel_path.replace("\\", "/")
    for d in IGNORED_DIRS:
        if rel_path_fwd == d or rel_path_fwd.startswith(d + "/"):
            return True
    fname = os.path.basename(rel_path)
    if fname in IGNORED_FILES:
        return True
    ext = os.path.splitext(fname)[1].lower()
    if ext in IGNORED_EXTENSIONS:
        return True
    return False

def make_request(url, method="GET", data=None, token=None, content_type="application/json"):
    headers = {
        "User-Agent": "Bubu-Dudu-Deployer",
        "Accept": "application/vnd.github.v3+json"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type

    body_bytes = None
    if data is not None:
        if isinstance(data, (dict, list)):
            body_bytes = json.dumps(data).encode("utf-8")
        elif isinstance(data, (bytes, bytearray)):
            body_bytes = data
        elif isinstance(data, str):
            body_bytes = data.encode("utf-8")

    req = urllib.request.Request(url, data=body_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read()
            if resp.headers.get_content_type() == "application/json":
                return json.loads(resp_body.decode("utf-8"))
            return resp_body
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"GitHub API Error {e.code}: {err_msg}")

def deploy_to_github(token, repo_name="bubu-dudu-desktop-pet", is_private=True, upload_releases=True):
    print("\n--- Connecting to GitHub API ---")
    user_info = make_request("https://api.github.com/user", token=token)
    username = user_info["login"]
    print(f"Authenticated as: {username} ({user_info.get('name', username)})")

    # 1. Check or Create Private Repository
    repo_full = f"{username}/{repo_name}"
    repo_url = f"https://api.github.com/repos/{repo_full}"
    repo_data = None
    try:
        repo_data = make_request(repo_url, token=token)
        print(f"Found existing repository: {repo_full} (Private: {repo_data['private']})")
    except RuntimeError as e:
        if "404" in str(e):
            print(f"Creating new {'Private' if is_private else 'Public'} repository: {repo_full} ...")
            create_payload = {
                "name": repo_name,
                "private": is_private,
                "description": "Adorable Bubu & Dudu Desktop Pet for Windows and macOS (Electron)",
                "auto_init": True
            }
            repo_data = make_request("https://api.github.com/user/repos", method="POST", data=create_payload, token=token)
            print(f"Successfully created repository: {repo_data['html_url']}")
        else:
            raise

    # 2. Collect all project files
    print("\n--- Scanning project files for upload ---")
    files_to_upload = []
    for root, dirs, files in os.walk(PROJECT_ROOT):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, PROJECT_ROOT)
            if not should_ignore(rel_path):
                files_to_upload.append((rel_path, full_path))

    print(f"Found {len(files_to_upload)} files to synchronize.")

    # 3. Create Blobs & Git Tree
    tree_items = []
    print("Uploading file blobs to GitHub Git Database...")
    for idx, (rel_path, full_path) in enumerate(files_to_upload, 1):
        rel_posix = rel_path.replace("\\", "/")
        with open(full_path, "rb") as fp:
            content_bytes = fp.read()

        # Check if text or binary
        is_binary = b"\x00" in content_bytes[:1024]
        if is_binary:
            blob_payload = {
                "content": base64.b64encode(content_bytes).decode("ascii"),
                "encoding": "base64"
            }
        else:
            blob_payload = {
                "content": content_bytes.decode("utf-8", errors="replace"),
                "encoding": "utf-8"
            }

        blob_resp = make_request(f"{repo_url}/git/blobs", method="POST", data=blob_payload, token=token)
        tree_items.append({
            "path": rel_posix,
            "mode": "100644",
            "type": "blob",
            "sha": blob_resp["sha"]
        })
        if idx % 10 == 0 or idx == len(files_to_upload):
            print(f"  Uploaded {idx}/{len(files_to_upload)} files...", flush=True)

    # Create Tree
    print("Creating git tree...")
    tree_resp = make_request(f"{repo_url}/git/trees", method="POST", data={"tree": tree_items}, token=token)
    new_tree_sha = tree_resp["sha"]

    # Get parent commit if exists
    default_branch = repo_data.get("default_branch", "main")
    parent_sha = None
    try:
        ref_data = make_request(f"{repo_url}/git/refs/heads/{default_branch}", token=token)
        parent_sha = ref_data["object"]["sha"]
    except RuntimeError:
        pass

    # Create Commit
    print("Creating git commit...")
    commit_payload = {
        "message": "Production Grade Bubu & Dudu Desktop Pet v1.0.2 with GitHub Auto-Updater",
        "tree": new_tree_sha,
        "parents": [parent_sha] if parent_sha else []
    }
    commit_resp = make_request(f"{repo_url}/git/commits", method="POST", data=commit_payload, token=token)
    new_commit_sha = commit_resp["sha"]

    # Update Ref
    print(f"Updating branch {default_branch}...")
    try:
        make_request(
            f"{repo_url}/git/refs/heads/{default_branch}",
            method="PATCH",
            data={"sha": new_commit_sha, "force": True},
            token=token
        )
    except RuntimeError:
        # Create ref if branch didn't exist
        make_request(
            f"{repo_url}/git/refs",
            method="POST",
            data={"ref": f"refs/heads/{default_branch}", "sha": new_commit_sha},
            token=token
        )

    print(f"\n[OK] Source code successfully deployed to: {repo_data['html_url']}")

    # 4. Create GitHub Release & Upload Built Binaries
    if upload_releases and os.path.exists(DIST_DIR):
        print("\n--- Publishing Release & Distribution Assets ---")
        version_tag = "v1.0.2"
        release_payload = {
            "tag_name": version_tag,
            "name": f"Bubu & Dudu Pet {version_tag}",
            "body": "## Bubu & Dudu Desktop Pet v1.0.2\n\n- Production-grade cross-platform Electron app for Windows & macOS\n- Real-time hunger, vitality, and 5-minute sleep cycle\n- Dynamic action registry and standalone GIF asset importer\n- Automated GitHub Releases update checker",
            "draft": False,
            "prerelease": False
        }

        # Check existing release or create new
        release_data = None
        try:
            release_data = make_request(f"{repo_url}/releases/tags/{version_tag}", token=token)
            print(f"Using existing release {version_tag}")
        except RuntimeError:
            release_data = make_request(f"{repo_url}/releases", method="POST", data=release_payload, token=token)
            print(f"Created release {version_tag}: {release_data['html_url']}")

        upload_url_template = release_data.get("upload_url", "").split("{")[0]

        def norm_asset_name(name):
            import re
            return re.sub(r'[^a-zA-Z0-9._-]', '.', name).lower()

        existing_assets = {norm_asset_name(a["name"]): a for a in release_data.get("assets", [])}

        dist_files = [f for f in os.listdir(DIST_DIR) if "1.0.2" in f and not f.endswith(".blockmap")]
        for df in dist_files:
            file_path = os.path.join(DIST_DIR, df)
            if not os.path.isfile(file_path):
                continue

            local_size = os.path.getsize(file_path)
            norm_df = norm_asset_name(df)

            # If asset already uploaded with matching size, skip re-upload
            if norm_df in existing_assets:
                remote_size = existing_assets[norm_df].get("size", 0)
                if remote_size == local_size:
                    print(f"Asset {df} ({local_size / 1024 / 1024:.1f} MB) already up to date in release, skipping.")
                    continue
                else:
                    print(f"Removing prior asset {df} (size mismatch)...")
                    make_request(f"{repo_url}/releases/assets/{existing_assets[norm_df]['id']}", method="DELETE", token=token)

            print(f"Uploading asset {df} ({local_size / 1024 / 1024:.1f} MB)...", flush=True)
            with open(file_path, "rb") as f:
                asset_bytes = f.read()

            upload_url = f"{upload_url_template}?name={urllib.parse.quote(df)}"
            make_request(upload_url, method="POST", data=asset_bytes, token=token, content_type="application/octet-stream")
            print(f"  Successfully uploaded {df}!")

    # 5. Update package.json with the repository URL
    pkg_path = os.path.join(PROJECT_ROOT, "package.json")
    with open(pkg_path, "r", encoding="utf-8") as fp:
        pkg = json.load(fp)

    pkg["repository"] = {
        "type": "git",
        "url": f"https://github.com/{repo_full}.git"
    }

    with open(pkg_path, "w", encoding="utf-8") as fp:
        json.dump(pkg, fp, indent=2, ensure_ascii=False)
        fp.write("\n")

    print(f"\n[OK] package.json repository updated to: {repo_full}")
    print("\n==========================================")
    print(f"[SUCCESS] DEPLOYMENT COMPLETED SUCCESSFULLY!")
    print(f"Repository URL: {repo_data['html_url']} (Private: {repo_data['private']})")
    print(f"Release URL: {repo_data['html_url']}/releases/tag/v1.0.2")
    print("==========================================\n")
    return repo_data

if __name__ == "__main__":
    token = os.environ.get("GITHUB_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not token:
        print("Usage: python tools/deploy_github.py <GITHUB_TOKEN>")
        print("Or set GITHUB_TOKEN environment variable.")
        sys.exit(1)

    repo_name = sys.argv[2] if len(sys.argv) > 2 else "bubu-dudu-desktop-pet"
    deploy_to_github(token, repo_name=repo_name, is_private=True)

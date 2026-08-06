function download(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function slug(s) {
  return (
    (s || "quadro")
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICS_RE, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "quadro"
  );
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function exportBoard(board, users) {
  const usedMemberIds = new Set();
  Object.values(board.cards).forEach((c) => (c.memberIds || []).forEach((id) => usedMemberIds.add(id)));
  const relevantMembers = users.filter((u) => usedMemberIds.has(u.id)).map((u) => ({ id: u.id, name: u.name }));
  const payload = {
    kanbanExport: "board",
    version: 2,
    exportedAt: new Date().toISOString(),
    board,
    members: relevantMembers,
  };
  download(`${slug(board.title)}.json`, payload);
}

export function exportAll(state, users) {
  const payload = {
    kanbanExport: "full",
    version: 2,
    exportedAt: new Date().toISOString(),
    boards: state.boards,
    members: users.map((u) => ({ id: u.id, name: u.name })),
  };
  download(`xaphires-backup-${dateStamp()}.json`, payload);
}

function codedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function parseImportFile(file, defaultBoardTitle) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(codedError("IMPORT_READ_FAIL", "Não foi possível ler o arquivo"));
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (json.kanbanExport === "full" && Array.isArray(json.boards)) {
          resolve({ boards: json.boards });
        } else if (json.kanbanExport === "board" && json.board) {
          resolve({ boards: [json.board] });
        } else if (Array.isArray(json.boards)) {
          resolve({ boards: json.boards });
        } else if (json.lists && json.cards) {
          resolve({ boards: [{ title: json.boardTitle || json.title || defaultBoardTitle, lists: json.lists, cards: json.cards }] });
        } else {
          reject(codedError("IMPORT_UNRECOGNIZED_FORMAT", "Formato de arquivo não reconhecido"));
        }
      } catch (e) {
        reject(codedError("IMPORT_INVALID_JSON", "JSON inválido"));
      }
    };
    reader.readAsText(file);
  });
}

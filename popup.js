const saveBtn = document.getElementById("save-session");
const restoreBtn = document.getElementById("restore-session");
const closeBtn = document.getElementById("close-duplicates");
const sessionList = document.getElementById("session-list");

const rulesList = document.getElementById("rules-list");
const addRuleBtn = document.getElementById("add-rule");
const ruleNameInput = document.getElementById("rule-name");
const rulePatternInput = document.getElementById("rule-pattern");

const tabGroups = document.getElementById("tab-groups");

// ------------------ 세션 관리 ------------------
saveBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_TABS" }, (res) => {
    const tabs = res.tabs.map((t) => ({
      url: t.url,
      title: t.title,
      category: t.category,
    }));
    const name = prompt("세션 이름", "Session-" + Date.now());
    if (!name) return;
    chrome.storage.local.set({ [name]: { tabs } }, loadSessions);
  });
});

restoreBtn.addEventListener("click", () => {
  chrome.storage.local.get(null, (sessions) => {
    const keys = Object.keys(sessions);
    if (keys.length === 0) return alert("저장된 세션 없음");
    const lastKey = keys[keys.length - 1];
    chrome.runtime.sendMessage({
      type: "OPEN_SESSION",
      session: sessions[lastKey],
    });
  });
});

closeBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLOSE_DUPLICATES" }, () =>
    alert("중복 탭 정리 완료")
  );
});

function loadSessions() {
  sessionList.innerHTML = "";
  chrome.storage.local.get(null, (sessions) => {
    Object.keys(sessions).forEach((k) => {
      const li = document.createElement("li");
      li.textContent = k;
      li.style.cursor = "pointer";
      li.onclick = () =>
        chrome.runtime.sendMessage({
          type: "OPEN_SESSION",
          session: sessions[k],
        });
      sessionList.appendChild(li);
    });
  });
}

// ------------------ 규칙 관리 ------------------
function loadRules() {
  chrome.storage.sync.get(["rules"], (res) => {
    const rules = res.rules || [];
    rulesList.innerHTML = "";
    rules.forEach((r, i) => {
      const li = document.createElement("li");
      li.textContent = `${r.name}: ${r.pattern}`;
      li.style.cursor = "pointer";
      li.onclick = () => {
        if (confirm("삭제할까요?")) {
          rules.splice(i, 1);
          chrome.storage.sync.set({ rules }, () => {
            loadRules();
            loadTabGroups();
          });
        }
      };
      rulesList.appendChild(li);
    });
  });
}

addRuleBtn.addEventListener("click", () => {
  const name = ruleNameInput.value.trim();
  const pattern = rulePatternInput.value.trim();
  if (!name || !pattern) return alert("이름과 패턴 입력 필요");
  chrome.storage.sync.get(["rules"], (res) => {
    const rules = res.rules || [];
    rules.push({ name, pattern, color: "grey" });
    chrome.storage.sync.set({ rules }, () => {
      ruleNameInput.value = "";
      rulePatternInput.value = "";
      loadRules();
      loadTabGroups();
    });
  });
});

// ------------------ 그룹화 UI ------------------
function loadTabGroups() {
  chrome.runtime.sendMessage({ type: "GET_TABS" }, (res) => {
    const tabs = res.tabs || [];
    const groups = {};
    tabs.forEach((t) => {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    });

    tabGroups.innerHTML = "";
    Object.keys(groups).forEach((cat) => {
      const div = document.createElement("div");
      div.style.border = "1px solid #ccc";
      div.style.margin = "5px 0";
      div.style.padding = "5px";

      // 그룹 타이틀 + 관리 버튼
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      const title = document.createElement("strong");
      title.textContent = `${cat} (${groups[cat].length})`;
      header.appendChild(title);

      const btnGroup = document.createElement("div");
      btnGroup.style.display = "flex";
      btnGroup.style.gap = "5px"; // 버튼 사이 간격

      const openBtn = document.createElement("button");
      openBtn.textContent = "모두 열기";
      openBtn.className = "tab-group-btn"; // 클래스 추가
      openBtn.onclick = () => {
        groups[cat].forEach((t) => chrome.tabs.create({ url: t.url }));
      };
      btnGroup.appendChild(openBtn);

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "모두 닫기";
      closeBtn.className = "tab-group-btn"; // 클래스 추가
      closeBtn.onclick = () => {
        groups[cat].forEach((t) => chrome.tabs.remove(t.id));
        loadTabGroups();
      };
      btnGroup.appendChild(closeBtn);

      header.appendChild(btnGroup);
      div.appendChild(header);

      // 그룹 내 탭 리스트
      const ul = document.createElement("ul");
      groups[cat].forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t.title;
        li.style.cursor = "pointer";
        li.onclick = () => chrome.tabs.create({ url: t.url });
        ul.appendChild(li);
      });
      div.appendChild(ul);

      tabGroups.appendChild(div);
    });
  });
}

// ------------------ 초기 로드 ------------------
document.addEventListener("DOMContentLoaded", () => {
  loadSessions();
  loadRules();
  loadTabGroups();
});

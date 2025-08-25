// 저장된 규칙 불러오기 (기본 규칙 없음)
async function getRules() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["rules"], (res) => {
      resolve(res.rules || []);
    });
  });
}

// 탭 자동 분류
async function classifyTab(tab) {
  const rules = await getRules();
  const url = tab.url || "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  for (const r of rules) {
    const re = new RegExp(r.pattern, "i");
    if (re.test(host) || re.test(url))
      return { category: r.name, color: r.color || "grey" };
  }
  return { category: "Others", color: "grey" };
}

// 탭 세션 저장/복원 관련 함수
async function saveSession(tabs) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["sessions"], (res) => {
      const sessions = res.sessions || [];
      const now = new Date();
      const session = {
        id: Date.now(),
        name: `세션 ${now.toLocaleString()}`,
        tabs: tabs.map((t) => ({
          url: t.url,
          title: t.title,
          favIconUrl: t.favIconUrl,
        })),
      };
      sessions.push(session);
      chrome.storage.local.set({ sessions }, () => resolve(session));
    });
  });
}

async function getSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["sessions"], (res) => {
      resolve(res.sessions || []);
    });
  });
}

async function removeSession(sessionId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["sessions"], (res) => {
      let sessions = res.sessions || [];
      sessions = sessions.filter((s) => s.id !== sessionId);
      chrome.storage.local.set({ sessions }, () => resolve());
    });
  });
}

// 메시지 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "GET_TABS") {
        const tabs = await chrome.tabs.query({});
        const categorizedTabs = [];
        for (const t of tabs) {
          const { category } = await classifyTab(t);
          categorizedTabs.push({
            id: t.id,
            url: t.url,
            title: t.title,
            category,
            favIconUrl: t.favIconUrl,
          });
        }
        sendResponse({ tabs: categorizedTabs });
      }

      if (message.type === "CLOSE_DUPLICATES") {
        const tabs = await chrome.tabs.query({});
        const seen = new Set();
        for (const t of tabs) {
          if (seen.has(t.url)) chrome.tabs.remove(t.id);
          else seen.add(t.url);
        }
        sendResponse({ success: true });
      }

      // 세션 저장: 현재 열린 탭들을 세션으로 저장
      if (message.type === "SAVE_SESSION") {
        const tabs = await chrome.tabs.query({});
        const session = await saveSession(tabs);
        sendResponse({ success: true, session });
      }

      // 세션 목록 요청
      if (message.type === "GET_SESSIONS") {
        const sessions = await getSessions();
        sendResponse({ sessions });
      }

      // 세션 삭제
      if (message.type === "REMOVE_SESSION") {
        await removeSession(message.sessionId);
        sendResponse({ success: true });
      }

      // 세션 열기: 세션의 탭들을 새로 열기 (탭 그룹에 넣지 않음, 그냥 새 탭으로만)
      if (message.type === "OPEN_SESSION") {
        const session = message.session;
        if (session && session.tabs) {
          for (const t of session.tabs) {
            // 탭 그룹에 넣지 않고 그냥 새 탭으로만 연다
            chrome.tabs.create({ url: t.url });
          }
        }
        sendResponse({ success: true });
      }
    } catch (e) {
      console.error(e);
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});

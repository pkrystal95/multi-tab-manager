// DOM 요소들
const saveBtn = document.getElementById("save-session");
const restoreBtn = document.getElementById("restore-session");
const closeBtn = document.getElementById("close-duplicates");
const sessionList = document.getElementById("session-list");
const sessionCount = document.getElementById("session-count");

const rulesList = document.getElementById("rules-list");
const rulesCount = document.getElementById("rules-count");
const addRuleBtn = document.getElementById("add-rule");
const ruleNameInput = document.getElementById("rule-name");
const rulePatternInput = document.getElementById("rule-pattern");

const tabGroups = document.getElementById("tab-groups");
const showHiddenTabsBtn = document.getElementById("show-hidden-tabs");
const refreshTabsBtn = document.getElementById("refresh-tabs");
const statusBar = document.getElementById("status-text");

// 상태 관리
let isLoading = false;

// 상태 표시 함수
function updateStatus(message, type = "info") {
  statusBar.textContent = message;
  statusBar.className = `status-${type}`;

  // 3초 후 자동으로 상태 초기화
  setTimeout(() => {
    statusBar.textContent = "준비됨";
    statusBar.className = "";
  }, 3000);
}

// 로딩 상태 표시
function setLoading(loading) {
  isLoading = loading;
  if (loading) {
    updateStatus("처리 중...", "loading");
  }
}

// 에러 처리 함수
function handleError(error, context) {
  console.error(`${context} 오류:`, error);
  updateStatus(`${context} 실패: ${error.message}`, "error");
}

// 성공 메시지 표시
function showSuccess(message) {
  updateStatus(message, "success");
}

// ------------------ 유틸리티 함수 ------------------
function classifyTabFromSession(tab) {
  // background.js의 규칙을 사용하여 탭을 분류
  const url = tab.url || "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  // 기본 규칙들 (background.js와 동일)
  const defaultRules = [
    { name: "Entertainment", pattern: "(youtube|netflix|twitch)\\." },
    { name: "News", pattern: "(news|bbc|cnn|hankyung)\\." },
    { name: "Work", pattern: "(github|jira|notion)\\." },
  ];

  for (const rule of defaultRules) {
    const re = new RegExp(rule.pattern, "i");
    if (re.test(host) || re.test(url)) {
      return rule.name;
    }
  }
  return "Others";
}

// ------------------ 세션 관리 ------------------
saveBtn.addEventListener("click", () => {
  if (isLoading) return;

  setLoading(true);
  updateStatus("현재 탭 정보를 가져오는 중...");

  chrome.runtime.sendMessage({ type: "GET_TABS" }, (res) => {
    if (chrome.runtime.lastError) {
      handleError(chrome.runtime.lastError, "탭 정보 가져오기");
      setLoading(false);
      return;
    }

    const tabs = res.tabs.map((t) => ({
      url: t.url,
      title: t.title,
      category: t.category,
    }));

    const name = prompt(
      "세션 이름을 입력하세요",
      `Session-${new Date().toLocaleDateString()}`
    );
    if (!name) {
      setLoading(false);
      updateStatus("세션 저장 취소됨");
      return;
    }

    chrome.storage.local.set(
      { [name]: { tabs, createdAt: Date.now() } },
      () => {
        if (chrome.runtime.lastError) {
          handleError(chrome.runtime.lastError, "세션 저장");
        } else {
          showSuccess(`"${name}" 세션이 저장되었습니다`);
          loadSessions();
        }
        setLoading(false);
      }
    );
  });
});

restoreBtn.addEventListener("click", () => {
  if (isLoading) return;

  setLoading(true);
  updateStatus("저장된 세션을 확인하는 중...");

  chrome.storage.local.get(null, (sessions) => {
    if (chrome.runtime.lastError) {
      handleError(chrome.runtime.lastError, "세션 확인");
      setLoading(false);
      return;
    }

    const sessionKeys = Object.keys(sessions).filter(
      (key) => sessions[key].tabs
    );

    if (sessionKeys.length === 0) {
      updateStatus("저장된 세션이 없습니다", "warning");
      setLoading(false);
      return;
    }

    // 가장 최근 세션 선택
    const latestSession = sessionKeys.reduce((latest, key) => {
      const current = sessions[key];
      return !latest || current.createdAt > latest.createdAt ? current : latest;
    });

    const latestKey = sessionKeys.find(
      (key) => sessions[key] === latestSession
    );

    if (
      confirm(
        `"${latestKey}" 세션을 복원하시겠습니까?\n${latestSession.tabs.length}개의 탭이 열립니다.`
      )
    ) {
      updateStatus("세션을 복원하는 중...");

      chrome.runtime.sendMessage(
        {
          type: "OPEN_SESSION",
          session: latestSession,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            handleError(chrome.runtime.lastError, "세션 복원");
          } else {
            showSuccess(`"${latestKey}" 세션이 복원되었습니다`);
          }
          setLoading(false);
        }
      );
    } else {
      setLoading(false);
      updateStatus("세션 복원 취소됨");
    }
  });
});

closeBtn.addEventListener("click", () => {
  if (isLoading) return;

  if (confirm("중복 탭을 닫으시겠습니까?")) {
    setLoading(true);
    updateStatus("중복 탭을 정리하는 중...");

    chrome.runtime.sendMessage({ type: "CLOSE_DUPLICATES" }, (response) => {
      if (chrome.runtime.lastError) {
        handleError(chrome.runtime.lastError, "중복 탭 정리");
      } else {
        showSuccess("중복 탭 정리 완료");
        loadTabGroups(); // 탭 그룹 새로고침
      }
      setLoading(false);
    });
  }
});

function loadSessions() {
  chrome.storage.local.get(null, (sessions) => {
    if (chrome.runtime.lastError) {
      handleError(chrome.runtime.lastError, "세션 로드");
      return;
    }

    const sessionKeys = Object.keys(sessions).filter(
      (key) => sessions[key].tabs
    );
    sessionCount.textContent = sessionKeys.length;

    sessionList.innerHTML = "";

    if (sessionKeys.length === 0) {
      sessionList.innerHTML =
        '<div class="empty-state">저장된 세션이 없습니다</div>';
      return;
    }

    // 생성일 기준으로 정렬 (최신순)
    sessionKeys.sort((a, b) => {
      const aTime = sessions[a].createdAt || 0;
      const bTime = sessions[b].createdAt || 0;
      return bTime - aTime;
    });

    sessionKeys.forEach((k) => {
      const session = sessions[k];
      const div = document.createElement("div");
      div.className = "session-item";

      const sessionInfo = document.createElement("div");
      sessionInfo.className = "session-info";

      const sessionName = document.createElement("div");
      sessionName.className = "session-name";
      sessionName.textContent = k;
      sessionName.onclick = () => {
        if (
          confirm(
            `"${k}" 세션을 복원하시겠습니까?\n${session.tabs.length}개의 탭이 열립니다.`
          )
        ) {
          chrome.runtime.sendMessage({
            type: "OPEN_SESSION",
            session: session,
          });
        }
      };

      const sessionMeta = document.createElement("div");
      sessionMeta.className = "session-meta";
      sessionMeta.textContent = `${session.tabs.length}개 • ${new Date(
        session.createdAt || Date.now()
      ).toLocaleDateString()}`;

      sessionInfo.appendChild(sessionName);
      sessionInfo.appendChild(sessionMeta);

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑";
      deleteBtn.className = "delete-btn";
      deleteBtn.title = "세션 삭제";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`"${k}" 세션을 삭제하시겠습니까?`)) {
          chrome.storage.local.remove(k, () => {
            if (chrome.runtime.lastError) {
              handleError(chrome.runtime.lastError, "세션 삭제");
            } else {
              showSuccess(`"${k}" 세션이 삭제되었습니다`);
              loadSessions();
            }
          });
        }
      };

      div.appendChild(sessionInfo);
      div.appendChild(deleteBtn);
      sessionList.appendChild(div);
    });
  });
}

// ------------------ 규칙 관리 ------------------
function loadRules() {
  chrome.storage.sync.get(["rules"], (res) => {
    if (chrome.runtime.lastError) {
      handleError(chrome.runtime.lastError, "규칙 로드");
      return;
    }

    const rules = res.rules || [];
    rulesCount.textContent = rules.length;

    rulesList.innerHTML = "";

    if (rules.length === 0) {
      rulesList.innerHTML =
        '<div class="empty-state">설정된 규칙이 없습니다</div>';
      return;
    }

    rules.forEach((r, i) => {
      const div = document.createElement("div");
      div.className = "rule-item";

      const ruleInfo = document.createElement("div");
      ruleInfo.className = "rule-info";

      const ruleName = document.createElement("div");
      ruleName.className = "rule-name";
      ruleName.textContent = r.name;

      const rulePattern = document.createElement("div");
      rulePattern.className = "rule-pattern";
      rulePattern.textContent = r.pattern;

      ruleInfo.appendChild(ruleName);
      ruleInfo.appendChild(rulePattern);

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑";
      deleteBtn.className = "delete-btn";
      deleteBtn.title = "규칙 삭제";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`"${r.name}" 규칙을 삭제하시겠습니까?`)) {
          rules.splice(i, 1);
          chrome.storage.sync.set({ rules }, () => {
            if (chrome.runtime.lastError) {
              handleError(chrome.runtime.lastError, "규칙 삭제");
            } else {
              showSuccess(`"${r.name}" 규칙이 삭제되었습니다`);
              loadRules();
              loadTabGroups();
            }
          });
        }
      };

      div.appendChild(ruleInfo);
      div.appendChild(deleteBtn);
      rulesList.appendChild(div);
    });
  });
}

addRuleBtn.addEventListener("click", () => {
  if (isLoading) return;

  const name = ruleNameInput.value.trim();
  const pattern = rulePatternInput.value.trim();

  if (!name || !pattern) {
    updateStatus("이름과 패턴을 모두 입력해주세요", "warning");
    return;
  }

  // 정규식 유효성 검사
  try {
    new RegExp(pattern);
  } catch (e) {
    updateStatus("올바른 정규식을 입력해주세요", "error");
    return;
  }

  setLoading(true);
  updateStatus("규칙을 추가하는 중...");

  chrome.storage.sync.get(["rules"], (res) => {
    if (chrome.runtime.lastError) {
      handleError(chrome.runtime.lastError, "규칙 확인");
      setLoading(false);
      return;
    }

    const rules = res.rules || [];

    // 중복 이름 확인
    if (rules.some((r) => r.name === name)) {
      updateStatus("이미 존재하는 규칙 이름입니다", "error");
      setLoading(false);
      return;
    }

    rules.push({ name, pattern, color: "grey", createdAt: Date.now() });

    chrome.storage.sync.set({ rules }, () => {
      if (chrome.runtime.lastError) {
        handleError(chrome.runtime.lastError, "규칙 추가");
      } else {
        showSuccess(`"${name}" 규칙이 추가되었습니다`);
        ruleNameInput.value = "";
        rulePatternInput.value = "";
        loadRules();
        loadTabGroups();
      }
      setLoading(false);
    });
  });
});

// Enter 키로 규칙 추가
ruleNameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    rulePatternInput.focus();
  }
});

rulePatternInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addRuleBtn.click();
  }
});

// ------------------ 그룹화 UI ------------------
function loadTabGroups() {
  if (isLoading) return;

  console.log("loadTabGroups 시작");
  updateStatus("탭 정보를 로드하는 중...");

  // 현재 열려있는 탭과 저장된 세션 데이터를 모두 가져와서 통합
  Promise.all([
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_TABS" }, (res) => {
        if (chrome.runtime.lastError) {
          console.error("탭 정보 가져오기 오류:", chrome.runtime.lastError);
          resolve([]);
          return;
        }
        console.log("현재 탭들:", res.tabs);
        resolve(res.tabs || []);
      });
    }),
    new Promise((resolve) => {
      chrome.storage.local.get(null, (sessions) => {
        if (chrome.runtime.lastError) {
          console.error("세션 정보 가져오기 오류:", chrome.runtime.lastError);
          resolve({});
          return;
        }
        console.log("저장된 세션들:", sessions);
        resolve(sessions);
      });
    }),
    new Promise((resolve) => {
      chrome.storage.local.get(["hiddenTabs"], (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "숨김 탭 정보 가져오기 오류:",
            chrome.runtime.lastError
          );
          resolve([]);
          return;
        }
        const hiddenTabs = result.hiddenTabs || [];
        console.log("숨겨진 탭들:", hiddenTabs);
        resolve(hiddenTabs);
      });
    }),
  ])
    .then(([currentTabs, sessions, hiddenTabs]) => {
      console.log("데이터 로드 완료:", {
        currentTabs: currentTabs.length,
        sessions: Object.keys(sessions).length,
        hiddenTabs: hiddenTabs.length,
      });

      // 모든 탭을 통합 (현재 탭 + 세션에 저장된 탭)
      const allTabs = new Map();

      // 현재 열려있는 탭들을 추가 (숨겨진 탭 제외)
      currentTabs.forEach((tab) => {
        const tabKey = `${tab.url}-${tab.title}`;
        if (!hiddenTabs.includes(tabKey)) {
          allTabs.set(tabKey, {
            ...tab,
            source: "current",
            id: tab.id,
          });
        } else {
          console.log(`탭 ${tab.title}은 숨겨진 상태`);
        }
      });

      // 세션에 저장된 탭들을 추가 (중복되지 않는 것만, 숨겨진 탭 제외)
      Object.values(sessions).forEach((session) => {
        if (session.tabs) {
          session.tabs.forEach((tab) => {
            const tabKey = `${tab.url}-${tab.title}`;
            if (!allTabs.has(tabKey) && !hiddenTabs.includes(tabKey)) {
              allTabs.set(tabKey, {
                ...tab,
                source: "session",
                id: null,
              });
            }
          });
        }
      });

      console.log("통합된 탭들 (숨김 제외):", Array.from(allTabs.values()));

      // 통합된 탭들을 카테고리별로 그룹화
      const groups = {};
      allTabs.forEach((tab) => {
        const category = tab.category || "Others";
        if (!groups[category]) groups[category] = [];
        groups[category].push(tab);
      });

      console.log("그룹화된 탭들:", groups);

      // UI 업데이트
      tabGroups.innerHTML = "";

      if (Object.keys(groups).length === 0) {
        tabGroups.innerHTML =
          '<div class="empty-state">표시할 탭이 없습니다</div>';
        updateStatus("탭 로드 완료");
        return;
      }

      Object.keys(groups).forEach((cat) => {
        const div = document.createElement("div");
        div.className = "tab-group";

        // 그룹 헤더 (타이틀 + 카운트 + 버튼들)
        const header = document.createElement("div");
        header.className = "tab-group-header";

        const titleSection = document.createElement("div");
        titleSection.className = "tab-group-title";

        const title = document.createElement("span");
        title.textContent = cat;
        titleSection.appendChild(title);

        const count = document.createElement("span");
        count.className = "tab-group-count";
        count.textContent = groups[cat].length;
        titleSection.appendChild(count);

        header.appendChild(titleSection);

        // 버튼 그룹
        const btnGroup = document.createElement("div");
        btnGroup.className = "tab-group-header-buttons";

        const openBtn = document.createElement("button");
        openBtn.textContent = "열기";
        openBtn.className = "tab-group-btn";
        openBtn.title = "그룹의 모든 탭 열기";
        openBtn.onclick = () => {
          if (confirm(`"${cat}" 그룹의 모든 탭을 열겠습니까?`)) {
            updateStatus(`${cat} 그룹의 탭들을 여는 중...`);
            groups[cat].forEach((t) => chrome.tabs.create({ url: t.url }));
            showSuccess(`${cat} 그룹의 탭들이 열렸습니다`);
          }
        };
        btnGroup.appendChild(openBtn);

        const hideBtn = document.createElement("button");
        hideBtn.textContent = "숨김";
        hideBtn.className = "tab-group-btn secondary";
        hideBtn.title = "그룹 숨기기";
        hideBtn.onclick = () => {
          console.log(`${cat} 그룹 목록에서 숨김`);
          if (confirm(`"${cat}" 그룹의 모든 탭을 숨기시겠습니까?`)) {
            // 해당 그룹의 모든 탭을 숨김 목록에 추가
            chrome.storage.local.get(["hiddenTabs"], (result) => {
              const hiddenTabs = result.hiddenTabs || [];

              groups[cat].forEach((tab) => {
                const tabKey = `${tab.url}-${tab.title}`;
                if (!hiddenTabs.includes(tabKey)) {
                  hiddenTabs.push(tabKey);
                }
              });

              chrome.storage.local.set({ hiddenTabs }, () => {
                console.log(`${cat} 그룹의 모든 탭을 숨김 목록에 추가`);
                showSuccess(`${cat} 그룹이 숨겨졌습니다`);
              });
            });

            // 즉시 UI에서 해당 그룹 제거
            div.remove();
            console.log(`${cat} 그룹 숨김`);
          }
        };
        btnGroup.appendChild(hideBtn);

        const deleteGroupBtn = document.createElement("button");
        deleteGroupBtn.textContent = "삭제";
        deleteGroupBtn.className = "tab-group-btn delete";
        deleteGroupBtn.title = "그룹 삭제";
        deleteGroupBtn.onclick = () => {
          console.log(`${cat} 그룹 삭제`);
          if (confirm(`"${cat}" 그룹을 삭제하시겠습니까?`)) {
            // 해당 그룹의 모든 탭을 숨김 목록에 추가
            chrome.storage.local.get(["hiddenTabs"], (result) => {
              const hiddenTabs = result.hiddenTabs || [];

              groups[cat].forEach((tab) => {
                const tabKey = `${tab.url}-${tab.title}`;
                if (!hiddenTabs.includes(tabKey)) {
                  hiddenTabs.push(tabKey);
                }
              });

              chrome.storage.local.set({ hiddenTabs }, () => {
                console.log(`${cat} 그룹의 모든 탭을 숨김 목록에 추가`);
                showSuccess(`${cat} 그룹이 삭제되었습니다`);
              });
            });

            // 즉시 UI에서 해당 그룹 제거
            div.remove();
            console.log(`${cat} 그룹 삭제됨`);
          }
        };
        btnGroup.appendChild(deleteGroupBtn);

        header.appendChild(btnGroup);
        div.appendChild(header);

        // 그룹 내 탭 리스트
        const tabList = document.createElement("div");
        groups[cat].forEach((t) => {
          const tabItem = document.createElement("div");
          tabItem.className = "tab-item";

          // favicon (있는 경우)
          if (t.favIconUrl) {
            const favicon = document.createElement("img");
            favicon.src = t.favIconUrl;
            favicon.className = "tab-favicon";
            favicon.onerror = () => {
              favicon.style.display = "none";
            };
            tabItem.appendChild(favicon);
          }

          // 탭 내용 컨테이너 (제목 + URL)
          const tabContent = document.createElement("div");
          tabContent.className = "tab-content";

          // 탭 제목
          const title = document.createElement("div");
          title.className = "tab-title";
          title.textContent = t.title;
          title.title = t.title; // 툴팁으로 전체 제목 표시
          title.onclick = () => chrome.tabs.create({ url: t.url });
          tabContent.appendChild(title);

          // 탭 URL
          const url = document.createElement("div");
          url.className = "tab-url";
          url.textContent = t.url;
          url.title = t.url; // 툴팁으로 전체 URL 표시
          url.onclick = () => chrome.tabs.create({ url: t.url });
          tabContent.appendChild(url);

          tabItem.appendChild(tabContent);

          // 개별 탭 삭제 버튼
          const deleteTabBtn = document.createElement("button");
          deleteTabBtn.textContent = "×";
          deleteTabBtn.className = "delete-tab-btn";
          deleteTabBtn.title = "탭 숨김";
          deleteTabBtn.onclick = (e) => {
            e.stopPropagation();
            console.log(`개별 탭 ${t.title} 숨김`);

            if (confirm(`"${t.title}" 탭을 숨기시겠습니까?`)) {
              // 숨겨진 탭 목록에 추가
              chrome.storage.local.get(["hiddenTabs"], (result) => {
                const hiddenTabs = result.hiddenTabs || [];
                const tabKey = `${t.url}-${t.title}`;

                if (!hiddenTabs.includes(tabKey)) {
                  hiddenTabs.push(tabKey);
                  chrome.storage.local.set({ hiddenTabs }, () => {
                    console.log(`탭 ${t.title}을 숨김 목록에 추가`);
                    showSuccess(`"${t.title}" 탭이 숨겨졌습니다`);
                  });
                }
              });

              // 즉시 UI에서 해당 탭 제거
              tabItem.remove();

              // 그룹의 카운트 업데이트
              const countElement = div.querySelector(".tab-group-count");
              if (countElement) {
                const currentCount = parseInt(countElement.textContent);
                countElement.textContent = currentCount - 1;
                console.log(
                  `카운트 업데이트: ${currentCount} -> ${currentCount - 1}`
                );
              }

              // 그룹이 비어있으면 그룹도 제거
              if (tabList.children.length === 0) {
                div.remove();
                console.log("빈 그룹 제거됨");
              }
            }
          };
          tabItem.appendChild(deleteTabBtn);

          tabList.appendChild(tabItem);
        });
        div.appendChild(tabList);

        tabGroups.appendChild(div);
      });

      updateStatus("탭 로드 완료");
    })
    .catch((error) => {
      console.error("탭 그룹 로드 오류:", error);
      handleError(error, "탭 그룹 로드");
    });
}

// 새로고침 버튼 이벤트
refreshTabsBtn.addEventListener("click", () => {
  if (isLoading) return;
  loadTabGroups();
});

// 숨김 해제 버튼 이벤트
showHiddenTabsBtn.addEventListener("click", () => {
  if (isLoading) return;

  chrome.storage.local.get(["hiddenTabs"], (result) => {
    if (chrome.runtime.lastError) {
      handleError(chrome.runtime.lastError, "숨김 탭 확인");
      return;
    }

    const hiddenTabs = result.hiddenTabs || [];
    if (hiddenTabs.length === 0) {
      updateStatus("숨겨진 탭이 없습니다", "info");
      return;
    }

    if (
      confirm(`숨겨진 ${hiddenTabs.length}개의 탭을 다시 표시하시겠습니까?`)
    ) {
      setLoading(true);
      updateStatus("숨김 해제 중...");

      chrome.storage.local.remove(["hiddenTabs"], () => {
        if (chrome.runtime.lastError) {
          handleError(chrome.runtime.lastError, "숨김 해제");
        } else {
          showSuccess(`${hiddenTabs.length}개의 탭이 다시 표시되었습니다`);
          loadTabGroups(); // 탭 그룹 다시 로드
        }
        setLoading(false);
      });
    }
  });
});

// ------------------ 초기 로드 ------------------
document.addEventListener("DOMContentLoaded", () => {
  loadSessions();
  loadRules();
  loadTabGroups();

  // 숨김 해제 버튼 이벤트
  showHiddenTabsBtn.addEventListener("click", () => {
    chrome.storage.local.get(["hiddenTabs"], (result) => {
      const hiddenTabs = result.hiddenTabs || [];
      if (hiddenTabs.length === 0) {
        alert("숨겨진 탭이 없습니다.");
        return;
      }

      if (
        confirm(`숨겨진 ${hiddenTabs.length}개의 탭을 다시 표시하시겠습니까?`)
      ) {
        chrome.storage.local.remove(["hiddenTabs"], () => {
          console.log("숨김 해제 완료");
          loadTabGroups(); // 탭 그룹 다시 로드
        });
      }
    });
  });
});

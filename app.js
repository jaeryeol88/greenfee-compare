(() => {
  const data = window.GOLF_DATA;
  if (!data) throw new Error("가격 데이터를 불러오지 못했습니다.");

  const snapshotRows = Array.isArray(window.VERIFIED_PRICES) ? window.VERIFIED_PRICES : [];
  const courseAliases = new Map([
    ["애플밸리p9", "애플밸리"],
    ["대가야p9", "대가야"],
    ["펜타뷰p9", "펜타뷰"],
    ["이스턴p9", "이스턴"],
    ["해라p9", "해라"],
    ["기장동원로얄p9", "기장동원로얄"],
    ["코오롱가든p9", "코오롱가든"],
    ["가야퍼블릭p9", "가야퍼블릭"],
    ["시엘p9", "시엘"],
    ["삼삼p9", "삼삼"],
  ]);
  const normalizeCourse = (value) => {
    const normalized = String(value || "")
      .replace(/\((?:구\.?\s*[^)]*)\)/g, "")
      .replace(/컨트리클럽|골프클럽|CC/gi, "")
      .replace(/[^0-9A-Za-z가-힣]/g, "")
      .toLowerCase();
    return courseAliases.get(normalized) || normalized;
  };

  const recalculateRow = (row) => {
    const prices = [];
    if (row.kakaoEffective != null) prices.push(["카카오골프", row.kakaoEffective]);
    if (row.teePrice != null) prices.push(["티스캐너", row.teePrice]);
    if (row.plkPrice != null) prices.push(["퍼시픽링스", row.plkPrice]);
    prices.sort((a, b) => a[1] - b[1]);
    row.numericPlatformCount = prices.length;
    row.difference = prices.length >= 2 ? prices[1][1] - prices[0][1] : null;
    row.cheapest = prices.length ? prices.filter(([, price]) => price === prices[0][1]).map(([name]) => name) : [];
  };

  if (snapshotRows.length) {
    const preferredNames = new Map();
    data.rows.forEach((row) => preferredNames.set(normalizeCourse(row.course), row.course));
    const byKey = new Map(data.rows.map((row) => [`${row.date}|${normalizeCourse(row.course)}`, row]));

    snapshotRows.forEach((item) => {
      const normalized = normalizeCourse(item.course);
      const key = `${item.date}|${normalized}`;
      let row = byKey.get(key);
      if (!row) {
        row = {
          date: item.date,
          course: preferredNames.get(normalized) || item.course,
          kakaoPrice: null,
          kakaoDisplay: null,
          kakaoEffective: null,
          kakaoRefund: 0,
          teePrice: null,
          plkPrice: null,
          plkContract: false,
          plkTeams: null,
          difference: null,
          cheapest: [],
          numericPlatformCount: 0,
          kakaoBallGift: false,
          kakaoSpecial: false,
          kakaoBenefitLabels: [],
          kakaoBenefitDate: null,
          kakaoBenefitEvidence: null,
          teeBenefitLabels: [],
          teeBenefitDate: null,
          teeBenefitEvidence: null,
          promotionNote: null,
          kakaoUrl: `https://www.kakao.golf/tee-time?date=${item.date.replaceAll("-", "")}&area=4&reservable=true`,
          teeUrl: `https://www.teescanner.com/booking/list?roundDay=${item.date}&tab=golfcourse`,
          plkUrl: `https://mapp.pacificlinks.co.kr/new/booking_live?day=${item.date.replaceAll("-", "")}`,
          kakaoSourceVerified: false,
          teeSourceVerified: false,
          plkSourceVerified: false,
        };
        data.rows.push(row);
        byKey.set(key, row);
        preferredNames.set(normalized, row.course);
      }

      const benefits = Array.isArray(item.benefits) ? item.benefits : [];
      if (item.platform === "카카오골프") {
        row.kakaoPrice = item.price;
        row.kakaoDisplay = item.display || null;
        row.kakaoRefund = Number(item.refund || 0);
        row.kakaoEffective = item.price == null ? null : Math.max(0, item.price - row.kakaoRefund);
        row.kakaoTeams = item.teams ?? null;
        row.kakaoBenefitLabels = benefits;
        row.kakaoSpecial = benefits.some((label) => label.includes("특가"));
        row.kakaoBallGift = benefits.some((label) => /골프공|예약자.*볼|볼.*지급|볼.*증정/.test(label));
        row.kakaoBenefitDate = benefits.length ? item.date : null;
        row.kakaoBenefitEvidence = item.evidence || null;
        row.promotionNote = row.kakaoRefund ? "1만원 환급" : null;
        row.kakaoUrl = item.url;
        row.kakaoSourceVerified = true;
      } else if (item.platform === "티스캐너") {
        row.teePrice = item.price;
        row.teeDisplay = item.display || null;
        row.teeTeams = item.teams ?? null;
        row.teeBenefitLabels = benefits;
        row.teeBenefitDate = benefits.length ? item.date : null;
        row.teeBenefitEvidence = item.evidence || null;
        row.teeUrl = item.url;
        row.teeSourceVerified = true;
      } else if (item.platform === "퍼시픽링스") {
        row.plkPrice = item.price;
        row.plkContract = item.display === "협정가";
        row.plkTeams = item.teams ?? null;
        row.plkUrl = item.url;
        row.plkSourceVerified = true;
      }
      row.snapshotCheckedAt = item.checkedAt;
      recalculateRow(row);
    });

    const snapshotDates = new Set(snapshotRows.map((row) => row.date));
    data.rows.forEach(recalculateRow);
    data.rows.sort((a, b) => a.date.localeCompare(b.date) || a.course.localeCompare(b.course, "ko"));
    data.dates = [...new Set(data.rows.map((row) => row.date))].sort();
    data.courses = [...new Set(data.rows.map((row) => row.course))].sort((a, b) => a.localeCompare(b, "ko"));
    data.calendarDates.forEach((item) => {
      if (snapshotDates.has(item.date)) {
        item.status = "price-data";
        item.label = "가격 스냅샷 · 09/18 확인";
      }
    });

    const rows = data.rows;
    data.stats = {
      ...data.stats,
      rowCount: rows.length,
      courseCount: data.courses.length,
      dateStart: data.dates[0],
      dateEnd: data.dates[data.dates.length - 1],
      kakaoCount: rows.filter((row) => row.kakaoPrice != null).length,
      teeCount: rows.filter((row) => row.teePrice != null).length,
      plkNumericCount: rows.filter((row) => row.plkPrice != null).length,
      plkContractCount: rows.filter((row) => row.plkContract).length,
      plkAnyCount: rows.filter((row) => row.plkPrice != null || row.plkContract).length,
      comparableCount: rows.filter((row) => row.numericPlatformCount >= 2).length,
      threeWayCount: rows.filter((row) => row.numericPlatformCount === 3).length,
      refundCount: rows.filter((row) => row.kakaoRefund > 0).length,
      ballGiftCount: rows.filter((row) => row.kakaoBallGift).length,
      specialCount: rows.filter((row) => row.kakaoSpecial).length,
      specialCourseCount: new Set(rows.filter((row) => row.kakaoSpecial).map((row) => row.course)).size,
      ballGiftCourseCount: new Set(rows.filter((row) => row.kakaoBallGift).map((row) => row.course)).size,
    };
    const latestCheckedAt = snapshotRows.map((row) => row.checkedAt).filter(Boolean).sort().at(-1);
    data.meta.snapshotDate = latestCheckedAt ? latestCheckedAt.slice(0, 10) : data.meta.snapshotDate;
    data.meta.sourceCheckedAt = latestCheckedAt || data.meta.sourceCheckedAt;
    data.meta.notice = "가격은 수집 시점의 공개 최저 표시가입니다. 카카오골프 공개분은 최신 확인값을 반영하며, 티스캐너·퍼시픽링스 또는 아직 공개되지 않은 미래 가격은 추정하지 않습니다.";
  }

  // 선택한 날짜에는 가격 공개 여부와 관계없이 경상권 전체 골프장을 표시한다.
  // 미확인 행도 각 예약처의 날짜별 조회 화면으로 바로 이동할 수 있다.
  const completeKeys = new Set(data.rows.map((row) => `${row.date}|${row.course}`));
  data.calendarDates.forEach((calendar) => {
    data.courses.forEach((course) => {
      const key = `${calendar.date}|${course}`;
      if (completeKeys.has(key)) return;
      data.rows.push({
        date: calendar.date,
        course,
        kakaoPrice: null,
        kakaoDisplay: null,
        kakaoEffective: null,
        kakaoRefund: 0,
        kakaoTeams: null,
        teePrice: null,
        teeDisplay: null,
        teeTeams: null,
        plkPrice: null,
        plkContract: false,
        plkTeams: null,
        difference: null,
        cheapest: [],
        numericPlatformCount: 0,
        kakaoBallGift: false,
        kakaoSpecial: false,
        kakaoBenefitLabels: [],
        teeBenefitLabels: [],
        promotionNote: null,
        kakaoUrl: `https://www.kakao.golf/tee-time?date=${calendar.date.replaceAll("-", "")}&area=4&reservable=true`,
        teeUrl: `https://www.teescanner.com/booking/list?roundDay=${calendar.date}&tab=golfcourse`,
        plkUrl: `https://mapp.pacificlinks.co.kr/new/booking_live?day=${calendar.date.replaceAll("-", "")}`,
        kakaoSourceVerified: false,
        teeSourceVerified: false,
        plkSourceVerified: false,
      });
      completeKeys.add(key);
    });
  });
  data.rows.sort((a, b) => a.date.localeCompare(b.date) || a.course.localeCompare(b.course, "ko"));

  // 공개된 골프장 고유 주소를 재사용해 모든 링크를 선택 날짜에 맞춘다.
  const destinationByCourse = new Map();
  const providerId = (url, platform) => {
    if (!url) return null;
    const pattern = platform === "kakao" ? /\/golf\/(\d+)/ : /[?&]golfclub_seq=(\d+)/;
    return String(url).match(pattern)?.[1] || null;
  };
  data.rows.forEach((row) => {
    const key = normalizeCourse(row.course);
    const saved = destinationByCourse.get(key) || {};
    saved.kakaoId ||= providerId(row.kakaoUrl, "kakao");
    saved.teeId ||= providerId(row.teeUrl, "tee");
    destinationByCourse.set(key, saved);
  });
  const bookingUrl = (row, platform) => {
    const destination = destinationByCourse.get(normalizeCourse(row.course)) || {};
    if (platform === "kakao" && destination.kakaoId) return `https://www.kakao.golf/golf/${destination.kakaoId}?date=${row.date.replaceAll("-", "")}&area=4`;
    if (platform === "tee" && destination.teeId) return `https://www.teescanner.com/booking/detail?tab=review&golfclub_seq=${destination.teeId}&roundDay=${row.date}&isJoin=N`;
    if (platform === "plk") return `https://mapp.pacificlinks.co.kr/new/booking_live?day=${row.date.replaceAll("-", "")}`;
    return platform === "kakao"
      ? `https://www.kakao.golf/tee-time?date=${row.date.replaceAll("-", "")}&area=4&reservable=true`
      : `https://www.teescanner.com/booking/list?roundDay=${row.date}&tab=golfcourse`;
  };
  data.rows.forEach((row) => {
    row.kakaoUrl = bookingUrl(row, "kakao");
    row.teeUrl = bookingUrl(row, "tee");
    row.plkUrl = bookingUrl(row, "plk");
    const destination = destinationByCourse.get(normalizeCourse(row.course)) || {};
    row.kakaoCourseDirect = Boolean(destination.kakaoId);
    row.teeCourseDirect = Boolean(destination.teeId);
    row.courseDirectUrl = row.kakaoCourseDirect ? row.kakaoUrl : row.teeCourseDirect ? row.teeUrl : null;
  });

  // 최근 정상 확인 가격 fallback: 로그인/수집 실패 시 빈칸 대신 마지막 검증가를 유지한다.
  // 날짜별 실시간가와 혼동되지 않도록 각 카드에 원래 확인일을 함께 표시한다.
  const verifiedByCourse = new Map();
  data.rows.forEach((row) => {
    const courseKey = normalizeCourse(row.course);
    if (!verifiedByCourse.has(courseKey)) verifiedByCourse.set(courseKey, { plk: [], kakao: [], tee: [] });
    const bucket = verifiedByCourse.get(courseKey);
    if (row.plkPrice != null && !row.plkFallback) bucket.plk.push({ date: row.date, price: row.plkPrice, url: row.plkUrl });
    if (row.kakaoPrice != null && !row.kakaoFallback) bucket.kakao.push({ date: row.date, price: row.kakaoPrice, display: row.kakaoDisplay, refund: row.kakaoRefund, url: row.kakaoUrl });
    if (row.teePrice != null && !row.teeFallback) bucket.tee.push({ date: row.date, price: row.teePrice, display: row.teeDisplay, url: row.teeUrl });
  });
  verifiedByCourse.forEach((platforms) => Object.values(platforms).forEach((items) => items.sort((a, b) => a.date.localeCompare(b.date))));
  const nearestVerified = (items, targetDate) => {
    if (!items?.length) return null;
    const prior = items.filter((item) => item.date <= targetDate);
    return prior.at(-1) || items.at(-1);
  };
  data.rows.forEach((row) => {
    const verified = verifiedByCourse.get(normalizeCourse(row.course));
    if (!verified) return;
    if (row.plkPrice == null && !row.plkContract) {
      const item = nearestVerified(verified.plk, row.date);
      if (item) {
        row.plkPrice = item.price;
        row.plkFallback = true;
        row.plkFallbackDate = item.date;
      }
    }
    if (row.kakaoPrice == null && !row.kakaoDisplay) {
      const item = nearestVerified(verified.kakao, row.date);
      if (item) {
        row.kakaoPrice = item.price;
        row.kakaoRefund = Number(item.refund || 0);
        row.kakaoEffective = Math.max(0, item.price - row.kakaoRefund);
        row.kakaoFallback = true;
        row.kakaoFallbackDate = item.date;
      }
    }
    if (row.teePrice == null && !row.teeDisplay) {
      const item = nearestVerified(verified.tee, row.date);
      if (item) {
        row.teePrice = item.price;
        row.teeFallback = true;
        row.teeFallbackDate = item.date;
      }
    }
    recalculateRow(row);
  });

  const $ = (selector) => document.querySelector(selector);
  const els = {
    search: $("#course-search"),
    month: $("#month-filter"),
    date: $("#date-filter"),
    platform: $("#platform-filter"),
    benefit: $("#benefit-filter"),
    sort: $("#sort-filter"),
    rows: $("#price-rows"),
    count: $("#result-count"),
    empty: $("#empty-state"),
    more: $("#load-more"),
  };

  const won = (value) => value == null ? "–" : `${new Intl.NumberFormat("ko-KR").format(value)}원`;
  const formatDate = (iso) => {
    const [year, month, day] = iso.split("-").map(Number);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(year, month - 1, day).getDay()];
    return `${month}.${String(day).padStart(2, "0")} ${weekday}`;
  };
  const todayKst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const isPast = (iso) => iso < todayKst;
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const observedKey = "golf-price-observed-v1";
  let previousObserved = {};
  try { previousObserved = JSON.parse(localStorage.getItem(observedKey) || "{}"); } catch (_) { previousObserved = {}; }
  const currentObserved = {};
  const observedChange = (row, platform, value) => {
    if (value == null) return "";
    const key = `${row.date}|${row.course}|${platform}`;
    currentObserved[key] = value;
    const before = previousObserved[key];
    if (typeof before !== "number" || before === value) return "";
    const delta = value - before;
    return `<span class="price-change ${delta < 0 ? "down" : "up"}">${delta < 0 ? "▼" : "▲"} ${won(Math.abs(delta))}</span>`;
  };

  $("#metric-courses").textContent = data.stats.courseCount;
  $("#metric-prices").textContent = new Intl.NumberFormat("ko-KR").format(data.stats.kakaoCount + data.stats.teeCount);
  $("#metric-compared").textContent = new Intl.NumberFormat("ko-KR").format(data.rows.filter((row) => (row.plkPrice != null || row.plkContract) && (row.kakaoPrice != null || row.teePrice != null)).length);
  $("#metric-plk").textContent = new Intl.NumberFormat("ko-KR").format(data.stats.plkAnyCount);
  const snapshotDateEl = $("#snapshot-date");
  if (snapshotDateEl) snapshotDateEl.textContent = data.meta.snapshotDate;
  $("#source-checked").textContent = data.meta.sourceCheckedAt;
  $("#basis-copy").textContent = `${data.meta.priceBasis}. 비교 지역은 ${data.meta.regions}이며, 조회 가능한 ${data.stats.courseCount}개 골프장을 포함합니다.`;
  $("#notice-copy").textContent = `${data.meta.notice} ${data.meta.calendarNotice} ${data.meta.promotionNotice} ${data.meta.plkNotice}`;

  const calendarByDate = new Map(data.calendarDates.map((item) => [item.date, item]));
  const populateDates = (month, preferred = null) => {
    const monthDates = data.calendarDates.filter((item) => item.date.slice(5, 7) === month);
    const priceCount = (day) => data.rows.filter((row) => row.date === day && (row.plkPrice != null || row.plkContract || row.kakaoPrice != null || row.teePrice != null)).length;
    const plkCount = (day) => data.rows.filter((row) => row.date === day && (row.plkPrice != null || row.plkContract)).length;
    els.date.innerHTML = `<option value="all">${Number(month)}월 전체</option>${monthDates.map((item) => {
      const prices = priceCount(item.date);
      const plk = plkCount(item.date);
      const label = plk ? `PLK ${plk}곳 · 전체 ${prices}곳` : prices ? `타사 참고 ${prices}곳 · PLK 미확인` : "공개 가격 미확인";
      return `<option value="${item.date}">${formatDate(item.date)} · ${label}</option>`;
    }).join("")}`;
    const preferredHasPrices = preferred && monthDates.some((item) => item.date === preferred && priceCount(item.date));
    const preferredExists = preferred && monthDates.some((item) => item.date === preferred);
    const firstPlkDate = monthDates.find((item) => plkCount(item.date));
    const firstPriceDate = monthDates.find((item) => priceCount(item.date));
    els.date.value = preferredExists ? preferred : (firstPlkDate || firstPriceDate || monthDates[0])?.date || "all";
  };
  const initialMonth = data.calendarDates.some((item) => item.date === todayKst) ? todayKst.slice(5, 7) : "09";
  const pageParams = new URLSearchParams(window.location.search);
  const requestedDate = pageParams.get("date");
  const requestedCourse = pageParams.get("course");
  const requestedMonth = requestedDate && /^2026-(09|10|11|12)-\d{2}$/.test(requestedDate) ? requestedDate.slice(5, 7) : initialMonth;
  els.month.value = requestedMonth;
  populateDates(requestedMonth, requestedDate || todayKst);
  if (requestedCourse) els.search.value = requestedCourse;

  let visibleLimit = 40;

  const getFiltered = () => {
    const query = els.search.value.trim().toLowerCase();
    const date = els.date.value;
    const month = els.month.value;
    const platform = els.platform.value;
    const benefit = els.benefit.value;

    const filtered = data.rows.filter((row) => {
      if (query && !row.course.toLowerCase().includes(query)) return false;
      if (date !== "all" && row.date !== date) return false;
      if (date === "all" && row.date.slice(5, 7) !== month) return false;
      if (platform === "compare" && row.numericPlatformCount < 2) return false;
      if (platform === "three" && row.numericPlatformCount !== 3) return false;
      if (platform === "kakao" && row.kakaoPrice == null) return false;
      if (platform === "tee" && row.teePrice == null) return false;
      if (platform === "plk" && row.plkPrice == null && !row.plkContract) return false;
      if (platform === "plk-contract" && !row.plkContract) return false;
      if (benefit === "any" && !(row.kakaoRefund || row.kakaoBallGift || row.kakaoSpecial)) return false;
      if (benefit === "refund" && !row.kakaoRefund) return false;
      if (benefit === "ball" && !row.kakaoBallGift) return false;
      if (benefit === "special" && !row.kakaoSpecial) return false;
      return true;
    });

    if (els.sort.value === "plk") {
      filtered.sort((a, b) => (a.plkPrice ?? Infinity) - (b.plkPrice ?? Infinity) || Number(b.plkContract) - Number(a.plkContract) || a.course.localeCompare(b.course, "ko"));
    } else if (els.sort.value === "gap") {
      filtered.sort((a, b) => (b.difference ?? -1) - (a.difference ?? -1) || a.course.localeCompare(b.course, "ko"));
    } else if (els.sort.value === "low") {
      const low = (row) => Math.min(row.kakaoEffective ?? Infinity, row.teePrice ?? Infinity, row.plkPrice ?? Infinity);
      filtered.sort((a, b) => low(a) - low(b) || a.course.localeCompare(b.course, "ko"));
    } else {
      filtered.sort((a, b) => a.course.localeCompare(b.course, "ko") || a.date.localeCompare(b.date));
    }
    return filtered;
  };

  const sourceInitial = (label) => label === "카카오골프" ? "K" : label === "티스캐너" ? "T" : "P";
  const bookingAttrs = (row, platform, exact = false) => `data-booking-link data-course="${escapeHtml(row.course)}" data-date="${row.date}" data-platform="${escapeHtml(platform)}" data-exact="${exact ? "true" : "false"}"`;
  const sourceLink = (row, url, label, verified) => `<a class="source-link ${verified ? "verified" : "lookup"}" href="${escapeHtml(url)}" ${bookingAttrs(row, label)} target="_blank" rel="noreferrer" title="${escapeHtml(row.course)} · ${formatDate(row.date)} ${label} ${verified ? "확인 출처" : "조회"}">${sourceInitial(label)}</a>`;
  const priceLink = (row, url, content, label, exact) => `<a class="price-link" href="${escapeHtml(url)}" ${bookingAttrs(row, label, exact)} target="_blank" rel="noreferrer" aria-label="${escapeHtml(row.course)} ${formatDate(row.date)} ${escapeHtml(label)} 가격 확인">${content}<span class="price-link-hint">선택 날짜 확인 ↗</span></a>`;

  const rowHtml = (row) => {
    const kakaoWinner = row.cheapest.includes("카카오골프");
    const teeWinner = row.cheapest.includes("티스캐너");
    const plkWinner = row.cheapest.includes("퍼시픽링스");
    const specialLabel = row.kakaoBenefitLabels?.find((label) => label.includes("특가")) || "특가";
    const checkedDate = row.kakaoBenefitDate ? `${Number(row.kakaoBenefitDate.slice(5, 7))}/${Number(row.kakaoBenefitDate.slice(8, 10))}` : "";
    const badges = [
      row.kakaoRefund ? `<span class="badge refund">${won(row.kakaoRefund)} 환급</span>` : "",
      row.kakaoBallGift ? `<span class="badge gift" title="${escapeHtml(row.kakaoBenefitEvidence || "")}">예약자 골프공 지급${checkedDate ? ` · ${checkedDate} 확인` : ""}</span>` : "",
      row.kakaoSpecial ? `<span class="badge special" title="${escapeHtml(row.kakaoBenefitEvidence || "")}">${escapeHtml(specialLabel)}${checkedDate ? ` · ${checkedDate} 확인` : ""}</span>` : "",
    ].join("");
    const teeCheckedDate = row.teeBenefitDate ? `${Number(row.teeBenefitDate.slice(5, 7))}/${Number(row.teeBenefitDate.slice(8, 10))}` : "";
    const teeBadges = (row.teeBenefitLabels || []).map((label) =>
      `<span class="badge special" title="${escapeHtml(row.teeBenefitEvidence || "")}">${escapeHtml(label)}${teeCheckedDate ? ` · ${teeCheckedDate} 확인` : ""}</span>`
    ).join("");
    const winnerCopy = row.numericPlatformCount < 2
      ? "숫자 가격 1곳"
      : row.cheapest.length > 1
        ? `${row.cheapest.join("·")} 공동 최저`
        : `${row.cheapest[0]} 저렴`;

    const knownCount = [row.plkPrice != null || row.plkContract, row.kakaoPrice != null || row.kakaoDisplay, row.teePrice != null || row.teeDisplay].filter(Boolean).length;
    const priceCandidates = [
      row.plkPrice != null ? { name: "퍼시픽링스", price: row.plkPrice } : null,
      row.kakaoEffective != null ? { name: "카카오골프", price: row.kakaoEffective } : null,
      row.teePrice != null ? { name: "티스캐너", price: row.teePrice } : null,
    ].filter(Boolean).sort((a, b) => a.price - b.price);
    const lowestPrice = priceCandidates[0] || null;
    const lowestSummary = lowestPrice
      ? `<span class="lowest-label">최저가</span><strong>${won(lowestPrice.price)}</strong><small>${lowestPrice.name}</small>`
      : `<strong>가격 확인 필요</strong>`;
    const offer = (platform, url, priceMarkup, detailMarkup, badgeMarkup, primary = false, courseDirect = false) => `
      <div class="offer ${primary ? "primary-offer" : ""}">
        <div class="offer-brand"><span class="platform-logo">${sourceInitial(platform)}</span><div><strong>${platform}</strong><small>${primary ? "우선 예약처" : "참고 가격"}</small></div></div>
        <div class="offer-price">${priceLink(row, url, priceMarkup, platform, courseDirect)}${detailMarkup || ""}${badgeMarkup || ""}</div>
        <a class="book-button" href="${escapeHtml(url)}" ${bookingAttrs(row, platform, courseDirect)} target="_blank" rel="noreferrer">${courseDirect ? "골프장·날짜 바로보기" : platform === "퍼시픽링스" ? "PLK 로그인 후 선택" : "예약처에서 골프장 검색"}</a>
      </div>`;

    const internalCourseUrl = `?course=${encodeURIComponent(row.course)}&date=${row.date}#compare-heading`;
    const courseTarget = row.courseDirectUrl || internalCourseUrl;
    const courseTargetAttrs = row.courseDirectUrl ? `${bookingAttrs(row, row.kakaoCourseDirect ? "카카오골프" : "티스캐너", true)} target="_blank" rel="noreferrer"` : "";

    return `<article class="course-card" data-course="${escapeHtml(row.course)}" data-date="${row.date}">
      <header class="course-card-head">
        <div><div class="date-line">${formatDate(row.date)}${isPast(row.date) ? `<span class="past-label">지난 날짜</span>` : ""}</div><h3 class="course-name"><a href="${escapeHtml(courseTarget)}" ${courseTargetAttrs}>${escapeHtml(row.course)}<span>골프장·날짜 바로보기 ↗</span></a></h3></div>
        <span class="availability ${knownCount ? "has-price" : "no-price"}">${lowestSummary}<em>${knownCount}/3개사 확인</em></span>
      </header>
      <div class="offers">
        ${offer("퍼시픽링스", row.plkUrl, row.plkContract
          ? `<div class="price contract-price">협정가</div>`
          : `<div class="price ${plkWinner && row.plkPrice != null ? "winner" : ""} ${row.plkPrice == null ? "missing" : ""}">${row.plkPrice == null ? "가격 미확인" : won(row.plkPrice)}</div>`,
          `${row.plkFallback ? `<div class="team-count">최근 확인가 · ${row.plkFallbackDate}</div>` : ""}${observedChange(row, "plk", row.plkPrice)}${row.plkTeams != null ? `<div class="team-count">잔여 ${new Intl.NumberFormat("ko-KR").format(row.plkTeams)}팀</div>` : ""}`,
          row.plkContract ? `<div class="badges"><span class="badge contract">PLK 협정가</span></div>` : "", true, false)}
        ${offer("카카오골프", row.kakaoUrl,
          `<div class="price ${kakaoWinner && row.kakaoEffective != null ? "winner" : ""} ${row.kakaoPrice == null && !row.kakaoDisplay ? "missing" : ""}">${row.kakaoDisplay ? escapeHtml(row.kakaoDisplay) : row.kakaoPrice == null ? "가격 미확인" : won(row.kakaoPrice)}</div>`,
          `${row.kakaoFallback ? `<div class="team-count">최근 확인가 · ${row.kakaoFallbackDate}</div>` : ""}${observedChange(row, "kakao", row.kakaoEffective ?? row.kakaoPrice)}${row.kakaoRefund && row.kakaoEffective != null ? `<div class="effective">환급 적용 ${won(row.kakaoEffective)}</div>` : ""}${row.kakaoTeams != null ? `<div class="team-count">잔여 ${new Intl.NumberFormat("ko-KR").format(row.kakaoTeams)}팀</div>` : ""}`,
          badges ? `<div class="badges">${badges}</div>` : "", false, row.kakaoCourseDirect)}
        ${offer("티스캐너", row.teeUrl,
          `<div class="price ${teeWinner && row.teePrice != null ? "winner" : ""} ${row.teePrice == null && !row.teeDisplay ? "missing" : ""}">${row.teeDisplay ? escapeHtml(row.teeDisplay) : row.teePrice == null ? "가격 미확인" : won(row.teePrice)}</div>`,
          `${row.teeFallback ? `<div class="team-count">최근 확인가 · ${row.teeFallbackDate}</div>` : ""}${observedChange(row, "tee", row.teePrice)}${row.teeTeams != null ? `<div class="team-count">잔여 ${new Intl.NumberFormat("ko-KR").format(row.teeTeams)}팀</div>` : ""}`,
          teeBadges ? `<div class="badges">${teeBadges}</div>` : "", false, row.teeCourseDirect)}
      </div>
      <footer class="course-card-foot"><span>${winnerCopy}</span><div class="source-stack"><small>출처</small>${sourceLink(row, row.plkUrl, "퍼시픽링스", row.plkSourceVerified)}${sourceLink(row, row.kakaoUrl, "카카오골프", row.kakaoSourceVerified)}${sourceLink(row, row.teeUrl, "티스캐너", row.teeSourceVerified)}</div></footer>
    </article>`;
  };

  const render = () => {
    const filtered = getFiltered();
    els.count.textContent = new Intl.NumberFormat("ko-KR").format(filtered.length);
    els.rows.innerHTML = filtered.slice(0, visibleLimit).map(rowHtml).join("");
    els.empty.hidden = filtered.length !== 0;
    if (!filtered.length) {
      const selected = els.date.value !== "all" ? calendarByDate.get(els.date.value) : null;
      const monthHasPrices = data.rows.some((row) => row.date.slice(5, 7) === els.month.value);
      if (selected?.status === "unverified" || (!selected && !monthHasPrices)) {
        $("#empty-title").textContent = "공개 요금 미확인";
        $("#empty-copy").textContent = "실제 공개 가격을 확인한 뒤에만 비교표에 반영합니다.";
      } else {
        $("#empty-title").textContent = "조건에 맞는 가격이 없습니다";
        $("#empty-copy").textContent = "날짜나 혜택 필터를 바꿔보세요.";
      }
    }
    els.more.hidden = filtered.length <= visibleLimit;
    if (!els.more.hidden) els.more.textContent = `${new Intl.NumberFormat("ko-KR").format(filtered.length - visibleLimit)}개 결과 더 보기`;
  };

  els.month.addEventListener("change", () => {
    populateDates(els.month.value);
    visibleLimit = 40;
    render();
  });

  $("#search-action").addEventListener("click", () => {
    visibleLimit = 40;
    render();
    $("#compare-heading").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#filter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    $("#search-action").click();
  });

  [els.search, els.date, els.platform, els.benefit, els.sort].forEach((control) => {
    control.addEventListener(control === els.search ? "input" : "change", () => {
      visibleLimit = 40;
      render();
    });
  });

  $("#reset-filters").addEventListener("click", () => {
    els.search.value = "";
    els.month.value = initialMonth;
    populateDates(initialMonth, todayKst);
    els.platform.value = "all";
    els.benefit.value = "all";
    els.sort.value = "plk";
    visibleLimit = 40;
    render();
  });

  els.more.addEventListener("click", () => {
    visibleLimit += 40;
    render();
  });

  const dialog = $("#method-dialog");
  const nextMidnightKst = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date()).split("-").map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2] + 1) - (9 * 60 * 60 * 1000);
  };
  const reloadAt = nextMidnightKst();
  const updateRefreshStatus = () => {
    const remaining = Math.max(0, reloadAt - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.ceil((remaining % 3600000) / 60000);
    $("#auto-refresh-status").textContent = remaining > 0 ? `자정까지 ${hours}시간 ${minutes}분` : "최신 데이터 확인 중";
  };
  const forceRefresh = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("refresh", Date.now());
    window.location.replace(url.toString());
  };
  $("#refresh-page").addEventListener("click", forceRefresh);
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-booking-link]");
    if (!link) return;
    const { course, date, platform, exact } = link.dataset;
    const toast = $("#booking-toast");
    toast.textContent = exact === "true"
      ? `${course} · ${date} 골프장 예약 화면으로 바로 이동합니다.`
      : platform === "퍼시픽링스"
        ? `${course} · ${date} 조회입니다. PLK 로그인 후 해당 골프장을 선택해 주세요.`
        : `${date} 예약처 목록으로 이동합니다. ${course}를 검색해 주세요.`;
    toast.classList.add("show");
    clearTimeout(window.bookingToastTimer);
    window.bookingToastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
  });
  $("#open-method").addEventListener("click", () => dialog.showModal());
  $(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  render();
  try { localStorage.setItem(observedKey, JSON.stringify({ ...previousObserved, ...currentObserved })); } catch (_) {}
  updateRefreshStatus();
  setInterval(updateRefreshStatus, 60000);
  setTimeout(forceRefresh, Math.max(1000, reloadAt - Date.now()));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() >= reloadAt) forceRefresh();
  });
})();

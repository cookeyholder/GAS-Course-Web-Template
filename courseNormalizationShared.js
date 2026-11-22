/**
 * @file courseNormalizationShared.js
 * @description 108 課綱課程代碼對照表與 1NF 正規化純邏輯（前後端共用單一來源）
 *
 * 同時支援三種環境：
 * - Node.js：module.exports
 * - Google Apps Script：globalThis.courseNormalizationShared
 * - 瀏覽器：window.MEA.courseNormalizationShared
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.courseNormalizationShared = api;
    root.MEA = root.MEA || {};
    root.MEA.courseNormalizationShared = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** 正規化課程代碼標準表頭（共 14 欄） */
  const NORMALIZED_COURSE_HEADERS = [
    "開課學年",
    "開課學期",
    "修課年級",
    "學生入學年",
    "課程代碼",
    "科目名稱",
    "群別",
    "科別",
    "課程類別",
    "開課方式",
    "科目屬性",
    "必選修",
    "學分數",
    "開課時數"
  ];

  /** 科目屬性排除名單（本專案全數匯入，不剔除任何科目） */
  const EXCLUDED_SUBJECT_ATTRIBUTES = [];

  const GROUP_CODE_NAMES = {
    11: "學術群",
    21: "機械群",
    22: "動力機械群",
    23: "電機與電子群",
    24: "化工群",
    25: "土木與建築群",
    26: "商業與管理群／商業群(綜高、實用技能學程)",
    27: "外語群",
    28: "設計群",
    29: "農業群",
    30: "食品群",
    31: "家政群",
    32: "餐旅群",
    33: "水產群",
    34: "海事群",
    35: "藝術群",
    36: "美容造型群(實用技能學程)",
    40: "服務群(特殊教育類型)",
    41: "其他(綜高)"
  };

  /** 教育部 108 課綱官方核定標準科別代碼對照表（緊湊字串結構以維護 MI 指標） */
  const MINISTRY_DEPARTMENT_CODE_NAMES = (function () {
    const raw =
      "000:一般科目|099:其他|101:普通科|102:音樂班|103:美術班|104:舞蹈班|105:體育班|106:數理資優班|107:語文資優班|108:科學班|111:原住民藝能班|121:雙語部|122:戲劇班|123:人文與社會科學資優班|124:創造能力資優班|125:學術性向資優班|196:1年級不分群|197:學術社會學程|198:學術自然學程|201:農場經營科|202:園藝科|203:森林科|204:野生動物保育科|205:水產養殖科|206:水產食品科|208:畜產保健科|209:農業機械科|210:休閒農業科|211:生態保育科|212:造園科|213:園藝技術學程|214:造園技術學程|215:畜產加工技術學程|216:農業機械修護學程|217:農產加工學程|218:寵物經營學程|219:休閒農業學程|21A:不分科[農業群]|21B:不分科[機械群]|21C:不分科[動力機械群]|21D:不分科[電機與電子群]|21E:不分科[化工群]|21F:不分科[土木與建築群]|21G:不分科[商業與管理群]|21H:不分科[外語群]|21I:不分科[設計群]|21J:不分科[食品群]|21K:不分科[家政群]|21L:不分科[餐旅群]|21M:不分科[水產群]|21N:不分科[海事群]|21O:不分科[藝術群]|301:機械科|302:鑄造科|303:汽車科|304:板金科|305:資訊科|306:電子科|307:控制科|308:電機科|309:冷凍空調科|310:航空電子科|311:建築科|312:土木科|313:重機械修護科|314:配管科|315:化工科|316:紡織科|317:染整科|318:家具木工科|319:圖文傳播技術科|320:模具科|321:電機空調科|322:生物產業機電科|323:微電腦修護科|324:機械木模科|325:印刷科|326:飛機修護科|327:動力機械科|328:農田水利工程科|329:精密機械科|330:機械修護技術學程|331:車床操作技術學程|332:模具技術學程|333:鑄造技術學程|334:鉗工技術學程|335:板金技術學程|336:銲接技術學程|337:配管技術學程|338:汽車修護技術學程|339:塗裝技術學程|340:重機械修護技術學程|341:機車修護技術學程|342:農業機械修護技術學程|343:電器修護技術學程|344:電機修護技術學程|345:冷凍空調裝修技術學程|346:儀表修護技術學程|347:控制工程技術學程|348:視聽電子修護技術學程|349:電子通信修護技術學程|350:資訊產品修護技術學程|351:微電腦控制技術學程|352:電路軟體設計技術學程|353:化工技術學程|354:染整技術學程|355:環境檢驗技術學程|356:土木工程技術學程|357:鋼筋模板技術學程|358:泥水技術學程|359:建築製圖技術學程|360:營造技術學程|361:空間設計技術學程|362:水電技術學程|363:木工技術學程|364:商務印刷技術學程|365:圖文傳播技術學程|366:平版印刷技術學程|367:網版印刷技術學程|368:裝訂技術學程|369:照相製版技術學程|370:製鞋技術學程|371:紡織技術學程|372:車輛塗裝技術學程|373:圖文傳播科|374:電腦機械製圖科|375:室內空間設計科|376:製圖科|377:金屬工藝科|378:消防工程科|379:空間測繪科|380:水電技術科|381:智慧控制科|399:其他[工業群]|401:商業經營科|402:國際貿易科|403:會計事務科|404:資料處理科|405:文書事務科|406:不動產事務科|407:航運管理科|408:流通管理科|409:農會事務科|410:水產事務科|411:航運事務技術學程|412:商用資訊學程|413:航運業務學程|414:電腦打字學程|415:商業實務學程|416:流通便民學程|417:電子商務學程|418:會計實務學程|419:門市服務技術學程|420:電子商務科|421:科技應用學程|499:其他[商業與管理群]|501:水產養殖技術科|502:航海技術科|503:輪機技術科|504:漁撈技術科|505:水產養殖技術學程|506:航海技術學程|507:輪機技術學程|508:漁撈技術學程|509:船舶機電學程|510:航海科|511:輪機科|512:漁業科|513:水產食品技術學程|514:水產食品科|515:海洋漁業商務科|516:海洋休閒觀光科|601:家政科|602:服裝科|603:幼兒保育科|604:美容科|605:美髮科|606:西餐烹飪技術學程|607:服裝製作技術學程|608:中餐烹飪技術學程|609:餐飲服務技術學程|610:美容技術學程|611:美髮技術學程|612:烘焙食品技術學程|613:幼兒保育技術學程|614:調酒技術學程|615:女裝技術學程|616:男裝技術學程|617:飾品創作技術學程|618:美顏技術學程|619:美髮造型學程|620:指甲彩繪學程|621:時尚模特兒學程|622:服裝造型設計科|623:流行服飾科|624:時尚造型科|625:照顧服務科|626:照顧服務技術學程|627:時尚設計科|628:餐飲管理科|629:觀光事業科|630:休閒服務技術學程|631:觀光事務技術學程|632:客房服務技術學程|633:旅遊事務技術學程|634:旅館服務技術學程|635:休閒生活技術學程|636:餐旅事務學程|637:烘焙食品學程|638:中餐廚藝學程|639:西餐廚藝學程|640:飲料調製學程|641:免稅店事務學程|642:餐飲技術科|643:觀光技術科|644:餐飲技術學程|701:陶瓷工程科|702:美術工藝科|703:廣告設計科|704:多媒體設計科|705:多媒體技術科|706:金石工藝技術學程|707:陶瓷技術學程|708:廣告技術學程|709:多媒體技術學程|710:圖文傳播技術學程|711:視覺傳達設計學程|712:產品設計學程|713:室內設計技術學程|714:商品設計技術學程|715:環境設計技術學程|716:空間設計技術學程|717:網頁設計技術學程|718:電腦繪圖技術學程|719:工藝設計學程|720:造形藝術技術學程|721:繪畫技術學程|722:室內設計科|723:家具設計科|724:金屬工藝技術科|725:水產養殖技術科|801:水產食品科|802:航海技術科|803:輪機技術科|804:食品加工科|805:食品檢驗分析科|806:水產食品技術學程|807:食品加工技術學程|808:烘焙技術學程|809:食品技術學程|810:水產養殖技術學程|811:水產食品技術科|901:應用外語科(英文組)|902:應用外語科(日文組)|903:應用英語學程|904:應用日語學程|905:商用英語學程|906:商用日語學程|907:觀光英語學程|908:觀光日語學程|909:外語技術學程|910:應用英語科|911:應用日語科|A01:機械技術學程|A02:鑄造技術學程|A03:車床操作學程|A04:模具技術學程|A05:鉗工技術學程|A06:銲接技術學程|A07:電腦機械製圖學程|A08:機械修護學程|A09:配管技術學程|A10:精密機械學程|A11:生物產業機電學程|B01:汽車修護學程|B02:塗裝技術學程|B03:機車修護學程|B04:重機械修護學程|B05:車輛塗裝學程|B06:農業機械修護學程|B07:動力機械學程|C01:電機修護學程|C02:電器修護學程|C03:冷凍空調裝修學程|C04:視聽電子修護學程|C05:電子通信修護學程|C06:資訊產品修護學程|C07:微電腦控制學程|C08:控制工程學程|C09:儀表修護學程|C10:電路軟體設計學程|D01:化工技術學程|D02:染整技術學程|D03:環境檢驗技術學程|E01:土木工程技術學程|E02:鋼筋模板技術學程|E03:泥水技術學程|E04:建築製圖技術學程|E05:營造技術學程|E06:空間設計技術學程|E07:水電技術學程|E08:室內配線學程|E09:水電工程學程|F01:商業實務學程|F02:門市服務學程|F03:流通便民學程|F04:商務資訊學程|F05:文書處理學程|F06:會計實務學程|F07:航運業務學程|G01:農產加工學程|G02:園藝技術學程|G03:休閒農業學程|G04:農場實務學程|G05:畜產加工學程|G06:寵物經營學程|G07:造園技術學程|H01:水產養殖技術學程|H02:航海技術學程|H03:輪機技術學程|H04:水產食品技術學程|H05:海洋休閒觀光學程|I01:烘焙食品學程|I02:中餐廚藝學程|I03:西餐廚藝學程|I04:餐飲服務學程|I05:飲料調製學程|I06:美顏技術學程|I07:美髮技術學程|I08:時尚造型學程|I09:服裝製作學程|I10:幼兒保育學程|I11:照顧服務學程|I12:旅遊事務學程|I13:旅館服務學程|J01:廣告技術學程|J02:室內設計技術學程|J03:多媒體技術學程|J04:金石工藝學程|J05:陶瓷技術學程|J06:電腦繪圖學程|K01:食品加工學程|K02:烘焙技術學程|L01:商用英語學程|L02:商用日語學程|M01:表演藝術學程|M02:劇場藝術學程|N01:門市服務技術學程|N02:流通便民技術學程|P01:音樂學程|P02:美術學程|P03:舞蹈學程|P04:戲劇學程|Q01:體育學程|R01:造園景觀學程|R02:休閒生活學程|S01:金工技術學程|T01:微電腦修護學程|U01:多媒體設計學程|V01:家具設計學程|W01:食品加工學程|W03:食品技術學程|X02:應用日語學程|X03:應用德語學程|X04:應用法語學程|X11:應用英語學程|Y01:銀髮族活動管理學程|Y02:綜合職能學程";
    const dict = {};
    const pairs = raw.split("|");
    for (let i = 0; i < pairs.length; i++) {
      const idx = pairs[i].indexOf(":");
      if (idx !== -1) {
        dict[pairs[i].slice(0, idx)] = pairs[i].slice(idx + 1);
      }
    }
    return dict;
  })();

  /** 常見科別別名池（防止簡寫被誤判為未知科別） */
  const DEPARTMENT_ALIASES = {
    冷凍科: "309",
    空調科: "321",
    電機空調: "321",
    冷凍空調: "309",
    製圖科: "374",
    機圖科: "374",
    電腦製圖科: "374",
    電腦機械製圖: "374",
    圖傳科: "373",
    圖巧科: "373",
    圖文傳播: "373",
    機械: "301",
    機械工程: "301",
    機械工程科: "301",
    汽車: "303",
    資訊: "305",
    資訊管理: "305",
    資訊管理科: "305",
    電子: "306",
    控制: "307",
    電機: "308",
    建築: "311",
    化工: "315"
  };

  /** 共同科目科別代碼對照表 */
  const COMMON_DEPARTMENT_CODES = {
    國文: "CHI",
    國文科: "CHI",
    國語文: "CHI",
    英文: "ENG",
    英文科: "ENG",
    英語文: "ENG",
    數學: "MAT",
    數學科: "MAT",
    社會: "SOC",
    社會科: "SOC",
    自然: "SCI",
    自然科: "SCI",
    自然科學: "SCI",
    體育: "PE",
    體育科: "PE",
    國防: "DEF",
    國防科: "DEF",
    全民國防: "DEF",
    全民國防教育: "DEF",
    藝能: "ART",
    藝能科: "ART",
    輔導: "GUI",
    輔導科: "GUI"
  };

  const COMMON_CODE_SET = (function () {
    const set = {};
    for (const key in COMMON_DEPARTMENT_CODES) {
      set[COMMON_DEPARTMENT_CODES[key]] = COMMON_DEPARTMENT_CODES[key];
    }
    return set;
  })();

  const DEPARTMENT_CODE_NAMES = {
    301: "機械科",
    303: "汽車科",
    305: "資訊科",
    306: "電子科",
    308: "電機科",
    309: "冷凍空調科",
    311: "建築科",
    315: "化工科",
    321: "電機空調科",
    373: "圖文傳播科",
    374: "電腦機械製圖科"
  };

  const DEPARTMENT_NAME_TO_CODE = (function () {
    const cache = {};
    for (const code in MINISTRY_DEPARTMENT_CODE_NAMES) {
      cache[MINISTRY_DEPARTMENT_CODE_NAMES[code]] = code;
    }
    for (const code in DEPARTMENT_CODE_NAMES) {
      cache[DEPARTMENT_CODE_NAMES[code]] = code;
    }
    return cache;
  })();

  const SUBJECT_TYPE_NAMES = {
    1: "部定必修",
    2: "校訂必修",
    3: "選修-加深加廣選修",
    4: "選修-補強性選修",
    5: "選修-多元選修",
    6: "選修-其他",
    7: "校訂選修",
    8: "團體活動時間",
    9: "彈性學習時間",
    A: "大學預修課程",
    B: "基礎訓練",
    C: "職前訓練",
    D: "寒暑假課程",
    E: "返校課程",
    F: "職業技能訓練"
  };

  const OPEN_WAY_NAMES = {
    0: "原班級",
    1: "跨班選修(班群開課)",
    2: "綜高跨年級選修",
    A: "同科單班選修",
    B: "同科跨班選修",
    C: "同群跨科選修、跨學程選修",
    D: "同校跨群選修",
    E: "跨校選修"
  };

  const SUBJECT_ATTRIBUTION_NAMES = {
    0: "不分屬性",
    1: "一般科目",
    2: "專業科目",
    3: "實習科目",
    4: "專精科目",
    5: "專精科目(核心科目)",
    6: "特殊需求領域",
    A: "自主學習",
    B: "選手培訓",
    C: "充實(增廣)、補強性教學[全學期、不授予學分]",
    D: "充實(增廣)、補強性教學[全學期、授予學分]",
    E: "學校特色活動",
    F: "專精(專業)科目",
    G: "專精(實習)科目",
    H: "專精(專業)科目(核心)",
    I: "專精(實習)科目(核心)"
  };

  const REQUIRED_ELECTIVE_NAMES = {
    1: "必修",
    2: "選修"
  };

  /**
   * 正規化代碼鍵名：去除前後空白並轉為字串。純函式，無副作用。
   *
   * @param {*} code - 原始代碼
   * @returns {string} 正規化字串
   */
  function normalizeCodeKey(code) {
    return code === null || code === undefined ? "" : String(code).trim();
  }

  /**
   * 依群別代碼取得中文群別名稱。純函式，無副作用。
   *
   * @param {*} code - 群別代碼
   * @returns {string} 群別中文名稱
   */
  function getGroupName(code) {
    const key = normalizeCodeKey(code);
    return GROUP_CODE_NAMES[key] || key;
  }

  /**
   * 依科別代碼取得中文科別名稱。純函式，無副作用。
   *
   * @param {*} code - 科別代碼
   * @returns {string} 科別中文名稱
   */
  function getDepartmentNameByCode(code) {
    const key = normalizeCodeKey(code);
    return DEPARTMENT_CODE_NAMES[key] || key;
  }

  /**
   * 依科目類別代碼取得中文名稱（如部定必修、校訂必修等）。純函式，無副作用。
   *
   * @param {*} code - 類別代碼
   * @returns {string} 科目類別名稱
   */
  function getSubjectType(code) {
    const key = normalizeCodeKey(code);
    return SUBJECT_TYPE_NAMES[key] || key;
  }

  /**
   * 依開課方式代碼取得中文名稱（如原班級、跨班選修等）。純函式，無副作用。
   *
   * @param {*} code - 開課方式代碼
   * @returns {string} 開課方式名稱
   */
  function getOpenWay(code) {
    const key = normalizeCodeKey(code);
    return OPEN_WAY_NAMES[key] || key;
  }

  /**
   * 依科目屬性代碼取得中文屬性名稱（如一般科目、專業科目等）。純函式，無副作用。
   *
   * @param {*} code - 屬性代碼
   * @returns {string} 科目屬性名稱
   */
  function getSubjectAttribution(code) {
    const key = normalizeCodeKey(code);
    return SUBJECT_ATTRIBUTION_NAMES[key] || key;
  }

  /**
   * 依必選修代碼取得中文名稱（1: 必修、2: 選修）。純函式，無副作用。
   *
   * @param {*} code - 代碼
   * @returns {string} 必修或選修字串
   */
  function isRequiredOrElective(code) {
    const key = normalizeCodeKey(code);
    return REQUIRED_ELECTIVE_NAMES[key] || key;
  }

  /**
   * 判定列資料是否為課程代碼檔案之表頭列。純函式，無副作用。
   *
   * @param {Array<*>} row - 列陣列
   * @returns {boolean} 是否為表頭
   */
  function isCourseCodeHeaderRow(row) {
    if (!Array.isArray(row) || row.length === 0) return false;
    const first = normalizeCodeKey(row[0]);
    const attr = normalizeCodeKey(row[11]);
    return first === "課程代碼" || attr === "科目屬性";
  }

  /**
   * 判定列資料是否符合剔除科目屬性（本範本預設不剔除任何科目）。純函式，無副作用。
   *
   * @param {Array<*>} row - 列陣列
   * @returns {boolean} 是否剔除
   */
  function isExcludedCourseRow(row) {
    if (!Array.isArray(row)) return false;
    if (EXCLUDED_SUBJECT_ATTRIBUTES.length === 0) return false;
    return EXCLUDED_SUBJECT_ATTRIBUTES.indexOf(normalizeCodeKey(row[11])) !== -1;
  }

  /**
   * 將原始 39 欄寬表單列展開為多列 14 欄 1NF 標準課程紀錄。純函式，無副作用。
   *
   * @param {Array<*>} row - 原始 39 欄列資料
   * @returns {Array<Array<*>>} 展開後之 14 欄紀錄陣列
   */
  function expandCourseRow(row) {
    const expanded = [];
    if (!Array.isArray(row) || row.length < 31) return expanded;

    const entryYear = normalizeCodeKey(row[16]);
    const fallbackOpenWay = row[10];
    const courseCode = normalizeCodeKey(row[0]);
    const subjectName = normalizeCodeKey(row[2]);
    const groupName = getGroupName(row[6]) || "";
    const departmentName = getDepartmentNameByCode(row[7]) || "";
    const subjectType = getSubjectType(row[9]) || "";
    const subjectAttribution = getSubjectAttribution(row[11]) || "";
    const requiredOrElective = isRequiredOrElective(row[15]) || "";

    for (let s = 0; s < 6; s++) {
      const credits = Number(row[19 + s] || 0);
      const hours = Number(row[25 + s] || 0);
      if (!(credits > 0 || hours > 0)) continue;

      const gradeIndex = Math.floor(s / 2);
      const academicYear = normalizeCodeKey(row[16 + gradeIndex]);
      const semester = String((s % 2) + 1);
      const semesterValue = row[31 + s];
      const semesterOpenWay =
        semesterValue === null || semesterValue === undefined || semesterValue === "" ? fallbackOpenWay : semesterValue;

      expanded.push([
        academicYear,
        semester,
        String(gradeIndex + 1),
        entryYear,
        courseCode,
        subjectName,
        groupName,
        departmentName,
        subjectType,
        getOpenWay(semesterOpenWay) || "",
        subjectAttribution,
        requiredOrElective,
        credits,
        hours
      ]);
    }

    return expanded;
  }

  /**
   * 將原始課程代碼二維陣列進行 1NF 正規化展開運算。純函式，無副作用。
   *
   * @param {Array<Array<*>>} rawData - 原始二維陣列（含或不含表頭）
   * @param {Object} [options] - 選項設定
   * @param {string} [options.academicYear] - 限定開課學年
   * @param {string} [options.semester] - 限定開課學期
   * @param {boolean} [options.withStats=false] - 是否一併回傳統計摘要物件
   * @returns {Array<Array<*>>|{ rows: Array<Array<*>>, stats: Object }} 正規化結果
   */
  function normalizeCourseCodes(rawData, options) {
    const opts = options || {};
    const rows = Array.isArray(rawData) ? rawData : [];
    const academicYear = normalizeCodeKey(opts.academicYear);
    const semester = normalizeCodeKey(opts.semester);

    let sourceRows = 0;
    let excludedRows = 0;
    let keptCourseRows = 0;
    let totalExpanded = 0;
    const normalized = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length === 0) continue;
      if (isCourseCodeHeaderRow(row)) continue;

      sourceRows++;
      if (isExcludedCourseRow(row)) {
        excludedRows++;
        continue;
      }

      keptCourseRows++;
      const expanded = expandCourseRow(row);
      totalExpanded += expanded.length;

      for (let j = 0; j < expanded.length; j++) {
        const record = expanded[j];
        if (academicYear !== "" && record[0] !== academicYear) continue;
        if (semester !== "" && record[1] !== semester) continue;
        normalized.push(record);
      }
    }

    if (opts.withStats) {
      return {
        rows: normalized,
        stats: {
          sourceRows: sourceRows,
          excludedRows: excludedRows,
          keptCourseRows: keptCourseRows,
          expandedRows: totalExpanded,
          returnedRows: normalized.length
        }
      };
    }

    return normalized;
  }

  /**
   * 取得科別名稱對應之標準教育部代碼（無代碼時回傳空字串）。
   * 支援 3 碼英數（純數字、英數混合與實用技能學程）、前置/後置括號、別名、官方自帶方括號反查。
   *
   * @param {*} deptName - 科別名稱或代碼
   * @returns {string} 3 碼標準科別代碼或空字串
   */
  function getDepartmentCode(deptName) {
    if (deptName === null || deptName === undefined) return "";
    const raw = String(deptName).trim();
    if (!raw) return "";

    // 1. 本身即為 3 碼英數代碼（如 301, 21B, 21b, A01, a01）
    if (/^[0-9A-Za-z]{3}$/.test(raw)) {
      return raw.toUpperCase();
    }

    // 2. 前置代碼提取（如 "(301)機械科", "[A01]機械技術學程", "301 機械科", "301-機械科"）
    const prefixMatch = raw.match(/^[（(\[【]?([0-9A-Za-z]{3})[）)\]】]?[\s\-_]*(.*)$/);
    if (prefixMatch && prefixMatch[1]) {
      return prefixMatch[1].toUpperCase();
    }

    // 3. 後置括號代碼提取（如 "電腦機械製圖科(374)", "冷凍空調科（309）", "汽車技術學程[B01]"）
    const suffixMatch = raw.match(/^(.*?)[\s\-_]*[（(\[【]([0-9A-Za-z]{3})[）)\]】]$/);
    if (suffixMatch && suffixMatch[2]) {
      return suffixMatch[2].toUpperCase();
    }

    // 4. 去除括號雜質後反查字典
    const cleanName = raw.replace(/[（(\[【].*?[）)\]】]/g, "").trim();
    if (DEPARTMENT_ALIASES[cleanName]) return DEPARTMENT_ALIASES[cleanName];
    if (DEPARTMENT_NAME_TO_CODE[cleanName]) return DEPARTMENT_NAME_TO_CODE[cleanName];
    if (DEPARTMENT_NAME_TO_CODE[raw]) return DEPARTMENT_NAME_TO_CODE[raw];
    if (COMMON_DEPARTMENT_CODES[cleanName]) return COMMON_DEPARTMENT_CODES[cleanName];
    if (COMMON_DEPARTMENT_CODES[raw]) return COMMON_DEPARTMENT_CODES[raw];

    return "";
  }

  /**
   * 取得科別排序鍵（用於依代碼自然升冪排序）。
   * 採用四層排序鍵（Tier 0 專業科別、Tier 1 共同科、Tier 2 未知科別、Tier 3 空值置底）。
   *
   * @param {*} deptName - 科別名稱或代碼
   * @returns {string} 排序權重鍵
   */
  function getDepartmentSortKey(deptName) {
    if (deptName === null || deptName === undefined) return "3_";
    const raw = String(deptName).trim();
    if (!raw) return "3_";

    const cleanName = raw.replace(/[（(\[【].*?[）)\]】]/g, "").trim();
    const code = getDepartmentCode(raw);

    // Tier 1 共同科優先檢驗（避免 CHI/ENG 等 3 碼字母代碼被誤判為 Tier 0）
    const commonCode =
      COMMON_DEPARTMENT_CODES[raw] ||
      COMMON_DEPARTMENT_CODES[cleanName] ||
      COMMON_CODE_SET[raw.toUpperCase()] ||
      COMMON_CODE_SET[code];
    if (commonCode) {
      return "1_" + String(commonCode).toUpperCase();
    }

    // Tier 0 專業群科檢驗（需存在於教育部代碼庫或常設科別字典中）
    if (code && (MINISTRY_DEPARTMENT_CODE_NAMES[code] || DEPARTMENT_CODE_NAMES[code])) {
      return "0_" + code.toUpperCase();
    }

    // Tier 2 未知科別（正體中文自然排序）
    return "2_" + (cleanName || raw);
  }

  /**
   * 依教育部科別代碼由小到大排序兩個科別名稱。
   *
   * @param {*} deptA - 科別 A
   * @param {*} deptB - 科別 B
   * @returns {number} 排序比較值
   */
  function compareDepartmentsByCode(deptA, deptB) {
    const keyA = getDepartmentSortKey(deptA);
    const keyB = getDepartmentSortKey(deptB);

    if (keyA === keyB) {
      return String(deptA || "").localeCompare(String(deptB || ""), "zh-Hant");
    }

    const tierA = keyA.charAt(0);
    const tierB = keyB.charAt(0);

    // 跨階層直接比對前綴
    if (tierA !== tierB) {
      return tierA < tierB ? -1 : 1;
    }

    // Tier 0 與 Tier 1 為純英數字，直接以原生運算子比對
    if (tierA === "0" || tierA === "1") {
      return keyA < keyB ? -1 : 1;
    }

    // Tier 2 未知科別依正體中文字典順序排列
    if (tierA === "2") {
      return keyA.slice(2).localeCompare(keyB.slice(2), "zh-Hant");
    }

    return 0;
  }

  return {
    NORMALIZED_COURSE_HEADERS: NORMALIZED_COURSE_HEADERS,
    EXCLUDED_SUBJECT_ATTRIBUTES: EXCLUDED_SUBJECT_ATTRIBUTES,
    GROUP_CODE_NAMES: GROUP_CODE_NAMES,
    DEPARTMENT_CODE_NAMES: DEPARTMENT_CODE_NAMES,
    MINISTRY_DEPARTMENT_CODE_NAMES: MINISTRY_DEPARTMENT_CODE_NAMES,
    DEPARTMENT_ALIASES: DEPARTMENT_ALIASES,
    COMMON_DEPARTMENT_CODES: COMMON_DEPARTMENT_CODES,
    DEPARTMENT_NAME_TO_CODE: DEPARTMENT_NAME_TO_CODE,
    SUBJECT_TYPE_NAMES: SUBJECT_TYPE_NAMES,
    OPEN_WAY_NAMES: OPEN_WAY_NAMES,
    SUBJECT_ATTRIBUTION_NAMES: SUBJECT_ATTRIBUTION_NAMES,
    REQUIRED_ELECTIVE_NAMES: REQUIRED_ELECTIVE_NAMES,
    getGroupName: getGroupName,
    getDepartmentNameByCode: getDepartmentNameByCode,
    getDepartmentCode: getDepartmentCode,
    getDepartmentSortKey: getDepartmentSortKey,
    compareDepartmentsByCode: compareDepartmentsByCode,
    getSubjectType: getSubjectType,
    getOpenWay: getOpenWay,
    getSubjectAttribution: getSubjectAttribution,
    isRequiredOrElective: isRequiredOrElective,
    isCourseCodeHeaderRow: isCourseCodeHeaderRow,
    isExcludedCourseRow: isExcludedCourseRow,
    expandCourseRow: expandCourseRow,
    normalizeCourseCodes: normalizeCourseCodes
  };
});

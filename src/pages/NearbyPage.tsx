import { useCallback, useEffect, useMemo, useState } from 'react'
import BottomNav from '../components/BottomNav'
import NearbyRadar, { type RadarItem } from '../components/NearbyRadar'
import { Pict } from '../components/Pictogram'
import type { NavProps } from '../App'
import { loadProfile } from '../lib/profile'
import {
  bearingDegrees,
  bearingToCompassLabel,
  getCurrentPosition,
  type Coords,
} from '../lib/location'
import {
  AED_URL,
  DAREDEMO_URL,
  EVAC_AREAS_URL,
  SHELTERS_URL,
  SUPPORT_ROOMS_URL,
  WATER_URL,
  loadPoints,
  sortByDistance,
} from '../lib/restInfo'
import {
  DISASTER_TYPES,
  buildDisasterCandidates,
  disasterLabels,
  type DisasterTypeId,
  type SiteKind,
} from '../lib/disasterType'
import { fetchNearbyToilets, toiletsMatchAttrs, type ToiletPlace } from '../lib/toilets'
import {
  STATION_KIND_LABELS,
  loadStationFacilities,
  nearbyStationFacilities,
  type StationFacility,
} from '../lib/stations'
import { FEATURES } from '../lib/features'
import { AED_MAP_NOTE, aedMapUrl } from '../lib/aedMap'
import { STATION_MAP_NOTE, nearbyStationMap } from '../lib/stationMaps'
import { uniqueKeys } from '../lib/uniqueKeys'
import { NAV_FILTER_KEY, filterByAttrs, navFilterFromConsiderations, type NavFilter } from '../lib/mapFilter'
import {
  NEEDS,
  attrsForNeeds,
  defaultNeedsForCategories,
  showsAed,
  showsToilets,
  stationKindsForNeeds,
  toggleNeed,
  type NeedId,
} from '../lib/nearbyNeeds'
import './NearbyPage.css'

/** 平常時に一覧へ出す範囲（自分の周辺だけに絞る） */
const NEARBY_RADIUS_M = 300
/** 防災モードの避難所は遠いことが多いので範囲を広げ、件数で打ち切る */
const SHELTER_RADIUS_M = 2000
const SHELTER_LIMIT = 10
const AED_LIMIT = 5
const TOILET_LIMIT = 5
const WATER_LIMIT = 3
const STATION_LIMIT = 8
/** 一覧（と周辺図）に出す件数の上限。多すぎると、番号が読めなくなる */
const LIST_LIMIT = 12
/** 防災モードで、避難所の絞り込みに使える設備（それ以外の「必要なもの」は、避難所には当てはまらないので無視する） */
const SHELTER_ATTRS = ['elev', 'slope', 'braille', 'toilet']
/** 防災モードで出す「必要なもの」 */
const DISASTER_NEEDS: NeedId[] = ['toilet', 'lift']

/** 周辺図の点と、一覧の番号の色（種類ごと） */
const KIND_COLORS = {
  facility: '#2F7A6D',
  toilet: '#7B5EA7',
  aed: '#E5001A',
  shelter: '#D9772F',
  area: '#8C5A2B',
  water: '#2F6FA8',
  station: '#1F5D52',
  room: '#6B6B6B',
} as const

interface Place {
  n: string
  lat: number
  lng: number
  w?: string
  cat?: string
  addr?: string
  f?: string
  t?: string
  /** 給水拠点の種別（応急給水槽など） */
  k?: string
  /** 災害種別のビット列（src/lib/disasterType.ts） */
  d?: number
  /** 防災モードで、避難所か緊急避難場所か */
  site?: SiteKind
  demo?: boolean
  bf?: Record<string, boolean | undefined>
}

type Located = Place & { distanceM: number }

const BF_LABELS: Array<[string, string]> = [
  ['elev', 'エレベーター'],
  ['slope', 'スロープ'],
  ['toilet', '多目的WC'],
  ['braille', '点字ブロック'],
  ['written', '筆談可'],
  ['sign', '手話可'],
  ['wc_rental', '車椅子貸出'],
  // 車椅子使用者対応トイレの設備（public/data/toilets/）
  ['ostomate', 'オストメイト'],
  ['bed', '介助用ベッド'],
  ['auto', '自動ドア'],
  ['baby', 'おむつ交換台'],
]

const CAT_LABELS: Record<string, string> = {
  transport: '交通',
  public: '公共施設',
  parks: '公園',
  shopping: '買い物',
  dining: '飲食',
  leisure: 'レジャー',
}

function formatDistance(m: number): string {
  if (m < 50) return 'すぐ近く'
  return m < 1000 ? `約${Math.round(m / 10) * 10}m` : `約${(m / 1000).toFixed(1)}km`
}

function directionText(from: Coords, p: Place, distanceM: number): string {
  if (distanceM < 50) return 'すぐ近く'
  const label = bearingToCompassLabel(bearingDegrees(from, { latitude: p.lat, longitude: p.lng }))
  return `${label}へ${formatDistance(distanceM)}`
}

/** 地図アプリで開くURL（Googleマップ。端末に地図アプリがあれば、アプリで開く） */
function mapAppUrl(p: Place): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
}

/** 一覧と周辺図の1件 */
interface Row {
  key: string
  p: Located
  kind: string
  color: string
  tags: string[]
  /** 屋外の場所（公園・避難所・給水・AED）。地図アプリで開くリンクを、最初から見えるようにする */
  outdoor: boolean
}

export default function NearbyPage(nav: NavProps) {
  const [pos, setPos] = useState<Coords | null>(null)
  const [posError, setPosError] = useState(false)
  const [locating, setLocating] = useState(true)
  const [dataError, setDataError] = useState(false)
  const [disasterMode, setDisasterMode] = useState(false)
  const [facilities, setFacilities] = useState<Place[]>([])
  const [shelters, setShelters] = useState<Place[]>([])
  const [aeds, setAeds] = useState<Place[]>([])
  const [areas, setAreas] = useState<Place[]>([])
  const [water, setWater] = useState<Place[]>([])
  const [toilets, setToilets] = useState<ToiletPlace[]>([])
  const [toiletError, setToiletError] = useState(false)
  const [stations, setStations] = useState<StationFacility[]>([])
  const [disasterType, setDisasterType] = useState<DisasterTypeId | null>(null)
  const [rooms, setRooms] = useState<Place[]>([])
  const [navCtx, setNavCtx] = useState<NavFilter | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const profile = useMemo(() => loadProfile(), [])
  const isPartnerView = !profile || profile.profileType === 'supporter'
  // 「必要なもの」。着用者は、登録した区分に合うものを、最初から選んでおく（手動で変えられる）。パートナーは、何も選ばない
  const defaultNeeds = useMemo<NeedId[]>(
    () => (isPartnerView ? [] : defaultNeedsForCategories(profile?.categories ?? [])),
    [isPartnerView, profile],
  )
  const [needs, setNeeds] = useState<NeedId[]>(defaultNeeds)
  const needsAreDefault = defaultNeeds.length > 0 && needs.length === defaultNeeds.length && defaultNeeds.every((n) => needs.includes(n))
  const anxietyNotice = !isPartnerView && !!profile?.categories?.includes('anxiety')

  const locate = useCallback(() => {
    setLocating(true)
    setPosError(false)
    getCurrentPosition(8000)
      .then(setPos)
      .catch(() => setPosError(true))
      .finally(() => setLocating(false))
  }, [])

  useEffect(() => {
    locate()
    Promise.all([
      loadPoints<Place>(DAREDEMO_URL),
      loadPoints<Place>(SHELTERS_URL),
      loadPoints<Place>(AED_URL),
      loadPoints<Place>(SUPPORT_ROOMS_URL),
    ])
      .then(([f, s, a, r]) => {
        setFacilities(f)
        setShelters(s)
        setAeds(a)
        setRooms(r)
      })
      .catch(() => setDataError(true))
    // 駅の施設は、データが無い・読めないときも黙って空にする（loadStationFacilities は例外を出さない）
    loadStationFacilities().then(setStations)
    try {
      const raw = sessionStorage.getItem(NAV_FILTER_KEY)
      const labels = raw ? (JSON.parse(raw) as unknown) : null
      if (Array.isArray(labels) && labels.length > 0) setNavCtx(navFilterFromConsiderations(labels as string[]))
    } catch {
      /* 引き継ぎ情報が壊れていても一覧表示は続ける */
    }
  }, [locate])

  // 緊急避難場所・給水ステーションは、防災モードを開いたときに初めて読み込む
  useEffect(() => {
    if (!disasterMode) return
    loadPoints<Place>(WATER_URL).then(setWater).catch(() => setDataError(true))
  }, [disasterMode])
  useEffect(() => {
    if (!disasterMode || !disasterType) return
    loadPoints<Place>(EVAC_AREAS_URL).then(setAreas).catch(() => setDataError(true))
  }, [disasterMode, disasterType])

  // トイレは点が多いので、現在地の周辺のタイルだけを読む
  useEffect(() => {
    if (!pos || disasterMode) return
    let alive = true
    setToiletError(false)
    fetchNearbyToilets(pos, NEARBY_RADIUS_M)
      .then((t) => alive && setToilets(t))
      .catch(() => alive && setToiletError(true))
    return () => {
      alive = false
    }
  }, [pos, disasterMode])

  function clearNavCtx() {
    sessionStorage.removeItem(NAV_FILTER_KEY)
    setNavCtx(null)
  }

  // ── 絞り込み：選んだ「必要なもの」に合うものだけを出す（グループ間はAND、グループ内はOR）
  // 防災モードの避難所は、避難所が持つ設備（段差・点字・トイレ）に当てはまる分だけを使う。当てはまるものが無ければ、絞り込まない
  const selectedAttrs = attrsForNeeds(needs)
  const shelterAttrs = selectedAttrs ? selectedAttrs.filter((a) => SHELTER_ATTRS.includes(a)) : null
  const effectiveAttrs = disasterMode ? (shelterAttrs && shelterAttrs.length > 0 ? shelterAttrs : null) : selectedAttrs
  const attrGroups: Array<string[] | null> = []
  if (navCtx) attrGroups.push(navCtx.attrs)
  attrGroups.push(effectiveAttrs)
  // トイレ用は、車椅子対応のものだけなので、設備の絞り込みに「多目的WC」が含まれるときだけ出す
  const toiletGroups: Array<string[] | null> = [...(navCtx ? [navCtx.attrs] : []), selectedAttrs]

  const base = disasterMode ? buildDisasterCandidates(shelters, areas, disasterType) : facilities
  const filtered = attrGroups.reduce<Place[]>((list, g) => filterByAttrs(list, g), base)
  const sorted = pos ? sortByDistance(filtered, pos) : []
  const places: Located[] = disasterMode
    ? sorted.filter((p) => p.distanceM <= SHELTER_RADIUS_M).slice(0, SHELTER_LIMIT)
    : sorted.filter((p) => p.distanceM <= NEARBY_RADIUS_M)
  const nearbyToilets =
    pos && !disasterMode && showsToilets(needs) && toiletsMatchAttrs(toiletGroups)
      ? sortByDistance(toilets, pos).filter((p) => p.distanceM <= NEARBY_RADIUS_M).slice(0, TOILET_LIMIT)
      : []
  const nearbyWater = pos && disasterMode
    ? sortByDistance(water, pos).filter((p) => p.distanceM <= SHELTER_RADIUS_M).slice(0, WATER_LIMIT)
    : []
  const stationMap = pos ? nearbyStationMap(stations, pos) : null
  const stationRows: Located[] =
    pos && !disasterMode
      ? nearbyStationFacilities(stations, pos, NEARBY_RADIUS_M, stationKindsForNeeds(needs), STATION_LIMIT).map((f) => ({
          n: `${f.s} ${STATION_KIND_LABELS[f.k]}${f.f ? `（${f.f}）` : ''}`,
          lat: f.lat,
          lng: f.lng,
          f: f.f,
          addr: f.note,
          demo: f.demo,
          t: f.k,
          distanceM: f.distanceM,
        }))
      : []
  const nearestOutside = places.length === 0 && nearbyToilets.length === 0 ? sorted[0] : undefined
  const nearbyAeds =
    pos && !disasterMode && showsAed(needs) ? sortByDistance(aeds, pos).filter((p) => p.distanceM <= NEARBY_RADIUS_M).slice(0, AED_LIMIT) : []
  const nearbyRooms =
    pos && !disasterMode && navCtx?.medical ? sortByDistance(rooms, pos).filter((p) => p.distanceM <= NEARBY_RADIUS_M) : []

  const placeKind = (p: Place) =>
    disasterMode ? (p.site === 'area' ? '緊急避難場所' : '避難所') : CAT_LABELS[p.cat ?? ''] ?? '施設'

  // ── 一覧と周辺図に出す行（近い順にまとめる。番号は、周辺図の点と同じ）
  const rows: Row[] = uniqueKeys([
    ...places.map((p) => ({
      key: `place:${p.n}:${p.lat}`,
      p,
      kind: placeKind(p),
      color: disasterMode ? (p.site === 'area' ? KIND_COLORS.area : KIND_COLORS.shelter) : KIND_COLORS.facility,
      tags: disasterMode ? disasterLabels(p.d) : [],
      outdoor: disasterMode || p.cat === 'parks',
    })),
    ...stationRows.map((p) => ({ key: `station:${p.n}:${p.lat}`, p, kind: '駅の施設', color: KIND_COLORS.station, tags: [], outdoor: false })),
    ...nearbyToilets.map((p) => ({
      key: `toilet:${p.n}:${p.lat}`,
      p,
      kind: p.f ? `車椅子対応トイレ（${p.f}）` : '車椅子対応トイレ',
      color: KIND_COLORS.toilet,
      tags: [],
      outdoor: false,
    })),
    ...nearbyRooms.map((p) => ({ key: `room:${p.n}:${p.lat}`, p, kind: p.t === 'staff' ? '駅員室' : '救護室', color: KIND_COLORS.room, tags: [], outdoor: false })),
    ...nearbyWater.map((p) => ({
      key: `water:${p.n}:${p.lat}`,
      p,
      kind: p.k ? `災害時給水ステーション（${p.k}）` : '災害時給水ステーション',
      color: KIND_COLORS.water,
      tags: [],
      outdoor: true,
    })),
    ...nearbyAeds.map((p) => ({ key: `aed:${p.n}:${p.lat}`, p, kind: 'AED', color: KIND_COLORS.aed, tags: [], outdoor: true })),
  ]
    .sort((a, b) => a.p.distanceM - b.p.distanceM)
    .slice(0, LIST_LIMIT))

  const maxM = disasterMode ? SHELTER_RADIUS_M : NEARBY_RADIUS_M
  const radarItems: RadarItem[] = pos
    ? rows.map((r, i) => ({
        key: r.key,
        no: i + 1,
        bearing: bearingDegrees(pos, { latitude: r.p.lat, longitude: r.p.lng }),
        distanceM: r.p.distanceM,
        color: r.color,
      }))
    : []

  function selectOnRadar(key: string) {
    setOpenKey(key)
    document.getElementById(`row-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function renderRow(r: Row, no: number) {
    const { p } = r
    const open = openKey === r.key
    const bfTags = BF_LABELS.filter(([k]) => p.bf?.[k])
    return (
      <li key={r.key} id={`row-${r.key}`} className={`nearby__row${open ? ' is-open' : ''}`}>
        <button type="button" className="nearby__row-main" aria-expanded={open} onClick={() => setOpenKey(open ? null : r.key)}>
          <span className="nearby__row-no" style={{ background: r.color }} aria-hidden="true">{no}</span>
          <span className="nearby__row-body">
            <span className="nearby__row-name">{p.n}</span>
            <span className="nearby__row-dir">{pos ? directionText(pos, p, p.distanceM) : ''}</span>
            <span className="nearby__row-kind">{r.kind}</span>
          </span>
        </button>
        {(bfTags.length > 0 || r.tags.length > 0) && (
          <div className="nearby__tags">
            {r.tags.map((label) => (
              <span key={label} className="nearby__tag nearby__tag--disaster">{label}</span>
            ))}
            {bfTags.map(([k, label]) => (
              <span key={k} className="nearby__tag">{label}</span>
            ))}
          </div>
        )}
        {r.outdoor && (
          <a className="nearby__map-link nearby__map-link--inline" href={mapAppUrl(p)} target="_blank" rel="noreferrer">
            地図アプリで開く
          </a>
        )}
        {open && (
          <div className="nearby__detail">
            {(p.addr || p.w) && <p>{p.addr ?? p.w}</p>}
            {p.f && <p>設置場所：{p.f}</p>}
            {p.demo && <p className="nearby__demo">※デモ用のダミーデータです</p>}
            {!r.outdoor && (
              <a className="nearby__map-link" href={mapAppUrl(p)} target="_blank" rel="noreferrer">
                地図アプリで開く
              </a>
            )}
          </div>
        )}
      </li>
    )
  }

  const selectedType = DISASTER_TYPES.find((t) => t.id === disasterType)
  const radiusText = disasterMode ? `${SHELTER_RADIUS_M / 1000}km` : `${NEARBY_RADIUS_M}m`
  const chipNeeds = NEEDS.filter((n) => !disasterMode || DISASTER_NEEDS.includes(n.id))

  return (
    <div className="nearby-wrap">
      <main className="nearby">
        <header className="nearby__header">
          <h1 className="nearby__title">{disasterMode ? '近くの避難所' : '近くの施設'}</h1>
          <div className="nearby__mode" role="group" aria-label="表示モード">
            <button
              type="button"
              className={`nearby__mode-btn${!disasterMode ? ' is-active' : ''}`}
              aria-pressed={!disasterMode}
              onClick={() => setDisasterMode(false)}
            >
              ふだん
            </button>
            <button
              type="button"
              className={`nearby__mode-btn${disasterMode ? ' is-active is-disaster' : ''}`}
              aria-pressed={disasterMode}
              disabled={!FEATURES.disasterMode}
              onClick={() => setDisasterMode(true)}
            >
              <Pict name="warn" size={15} /> 防災
            </button>
          </div>
        </header>

        {!FEATURES.disasterMode && (
          <p className="nearby__maintenance" role="status">
            防災モードは現在作成中です。
          </p>
        )}

        <div className="nearby__status">
          {locating && <p>現在地を確認しています…</p>}
          {!locating && posError && <p>現在地を取得できませんでした。位置情報の許可を確認してください</p>}
          {!locating && pos && <p>現在地から{radiusText}以内の、近い順に表示しています</p>}
          <button type="button" className="nearby__relocate" onClick={locate} disabled={locating}>
            現在地を更新
          </button>
        </div>

        {navCtx && (
          <div className="nearby__banner">
            <span>支援している方の配慮事項で絞り込み中</span>
            <button type="button" onClick={clearNavCtx}>
              解除
            </button>
          </div>
        )}

        {anxietyNotice && !disasterMode && (
          <p className="nearby__notice">落ち着ける場所に関するデータは、現在整備されていません</p>
        )}

        <section className="nearby__needs" aria-label="必要なもの">
          <h2 className="nearby__section-title">いま必要なもの</h2>
          <div className="nearby__chips" role="group" aria-label="必要なものを選ぶ">
            {chipNeeds.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`nearby__chip${n.id === 'aed' ? ' nearby__chip--aed' : ''}${needs.includes(n.id) ? ' is-on' : ''}`}
                aria-pressed={needs.includes(n.id)}
                onClick={() => setNeeds((cur) => toggleNeed(cur, n.id))}
              >
                {n.label}
              </button>
            ))}
          </div>
          <p className="nearby__needs-note">
            {needs.length === 0
              ? '何も選んでいないので、近くのものをすべて出しています'
              : needsAreDefault
                ? '登録した内容に合わせて、選んであります。変えられます'
                : '選んだものに合う場所だけを出しています'}
          </p>
        </section>

        {disasterMode && (
          <section className="nearby__disasters" aria-label="災害の種類で絞り込む">
            <h2 className="nearby__section-title">災害の種類で絞り込む</h2>
            <div className="nearby__disaster-grid" role="group">
              <button
                type="button"
                className={`nearby__disaster-btn${disasterType === null ? ' is-on' : ''}`}
                aria-pressed={disasterType === null}
                onClick={() => setDisasterType(null)}
              >
                すべて
              </button>
              {DISASTER_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`nearby__disaster-btn${disasterType === t.id ? ' is-on' : ''}`}
                  aria-pressed={disasterType === t.id}
                  onClick={() => setDisasterType(disasterType === t.id ? null : t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {selectedType && (
              <p className="nearby__disaster-note">
                「{selectedType.label}」に対応している避難所・避難場所だけを表示しています。対応の情報がない場所は出ません
              </p>
            )}
          </section>
        )}

        {!disasterMode && stationMap && (
          <section className="nearby__station-map" aria-label="駅構内図">
            <a className="nearby__station-map-link" href={stationMap.url} target="_blank" rel="noreferrer">
              {stationMap.station}の構内図を開く
            </a>
            <p>{STATION_MAP_NOTE}</p>
          </section>
        )}

        {!disasterMode && needs.includes('aed') && (
          <section className="nearby__aed-note" aria-label="AEDについて">
            <p>
              このアプリに入っているAEDは、公開されているデータの一部の地域だけです。見つからないときは、日本全国AEDマップで探してください。急ぐときは、119番に電話してください。
            </p>
            <a className="nearby__aed-link" href={aedMapUrl(pos)} target="_blank" rel="noreferrer">
              日本全国AEDマップで、近くのAEDを探す
            </a>
            <p className="nearby__aed-external">{AED_MAP_NOTE}</p>
          </section>
        )}

        {dataError && <p className="nearby__notice">施設データを読み込めませんでした</p>}
        {toiletError && !disasterMode && <p className="nearby__notice">多機能トイレのデータを読み込めませんでした</p>}

        {pos && (
          <>
            {radarItems.length > 0 && (
              <NearbyRadar items={radarItems} maxM={maxM} selectedKey={openKey} onSelect={selectOnRadar} />
            )}
            <section className="nearby__section">
              <h2 className="nearby__section-title">近い順</h2>
              {rows.length > 0 ? (
                <ul className="nearby__list">{rows.map((r, i) => renderRow(r, i + 1))}</ul>
              ) : (
                <div className="nearby__empty">
                  <p>{radiusText}以内に、条件に合う場所はありません</p>
                  {needs.length > 0 && (
                    <button type="button" className="nearby__relocate" onClick={() => setNeeds([])}>
                      絞り込みを外す
                    </button>
                  )}
                  {nearestOutside && (
                    <>
                      <p className="nearby__empty-sub">いちばん近い場所（{radiusText}の外）</p>
                      <ul className="nearby__list">
                        {renderRow(
                          { key: `outside:${nearestOutside.n}`, p: nearestOutside, kind: placeKind(nearestOutside), color: disasterMode ? KIND_COLORS.shelter : KIND_COLORS.facility, tags: disasterMode ? disasterLabels(nearestOutside.d) : [], outdoor: true },
                          1,
                        )}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        <p className="nearby__credit">
          出典：東京都「だれでも東京」／東京都総務局「避難所・避難場所データ」（CC BY 4.0）／東京都福祉局「車椅子使用者対応トイレのバリアフリー情報」（CC BY 4.0）／東京都水道局「給水拠点一覧データ」（CC BY 4.0）／国土交通省「東京駅周辺屋内地図オープンデータ」（政府標準利用規約）を加工して作成／東京都オープンデータカタログ（各区AED設置箇所一覧）
        </p>
      </main>
      <BottomNav {...nav} />
    </div>
  )
}

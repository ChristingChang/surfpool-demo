"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Tab,
  FindMode,
  Trip,
  Application,
  PassengerRequest,
  Notification,
  TripReview,
  TripForm,
  BoardType,
  TripStatus,
  UserProfile,
} from "./types";
import {
  surfSpots,
  defaultTripForm,
  boardLabel,
  statusLabel,
} from "./data";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";

const TODAY = new Date().toISOString().slice(0, 10);

// ── DB row mappers (snake_case → camelCase) ────────────────────────────────

function mapTrip(r: Record<string, unknown>): Trip {
  return {
    id: r.id as string,
    driverId: r.driver_id as string,
    driver: r.driver_name as string,
    rating: r.driver_rating as number,
    completedTrips: r.driver_completed_trips as number,
    cancellations90d: r.driver_cancellations_90d as number,
    date: r.date as string,
    destination: r.destination as string,
    departureArea: r.departure_area as string,
    departureTime: r.departure_time as string,
    returnTime: r.return_time as string,
    tripType: r.trip_type as string,
    route: r.route as string,
    pickupMode: r.pickup_mode as string,
    seatsLeft: r.seats_left as number,
    maxPassengers: r.max_passengers as number,
    shortboards: r.shortboards as number,
    longboards: r.longboards as number,
    boardLocation: r.board_location as string,
    price: r.price as number,
    status: r.status as TripStatus,
    rules: r.rules as string[],
    note: r.note as string,
    exactPickup: (r.exact_pickup as string | null) ?? undefined,
    lineId: (r.line_id as string | null) ?? undefined,
  };
}

function mapApplication(r: Record<string, unknown>): Application {
  return {
    id: r.id as string,
    tripId: r.trip_id as string,
    passengerId: r.passenger_id as string,
    passenger: r.passenger_name as string,
    pickupArea: r.pickup_area as string,
    board: r.board as BoardType,
    lineId: r.line_id as string,
    note: r.note as string,
    status: r.status as Application["status"],
  };
}

function mapPassengerRequest(r: Record<string, unknown>): PassengerRequest {
  return {
    id: r.id as string,
    passengerId: r.passenger_id as string,
    passenger: r.passenger_name as string,
    rating: r.passenger_rating as number,
    completedTrips: r.passenger_completed_trips as number,
    cancellations90d: r.passenger_cancellations_90d as number,
    date: r.date as string,
    destination: r.destination as string,
    departureArea: r.departure_area as string,
    routeFlexibility: r.route_flexibility as string,
    tripType: r.trip_type as string,
    outboundTime: r.outbound_time as string,
    returnTime: r.return_time as string,
    board: r.board as BoardType,
    acceptablePrice: r.acceptable_price as number,
    lineId: r.line_id as string,
    note: r.note as string,
    status: r.status as PassengerRequest["status"],
  };
}

function mapNotification(r: Record<string, unknown>): Notification {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    text: r.text as string,
    type: r.type as Notification["type"],
    read: r.read as boolean,
  };
}

function mapTripReview(r: Record<string, unknown>): TripReview {
  return {
    id: r.id as string,
    reviewerId: r.reviewer_id as string,
    targetId: r.target_id as string,
    targetName: r.target_name as string,
    tripDate: r.trip_date as string,
    tripDestination: r.trip_destination as string,
    rating: r.rating as number,
    text: r.text as string,
  };
}

function mapUserProfile(r: Record<string, unknown>): UserProfile {
  return {
    id: r.id as string,
    displayName: r.display_name as string,
    rating: r.rating as number,
    completedTrips: r.completed_trips as number,
    cancellations90d: r.cancellations_90d as number,
    lineId: (r.line_id as string | null) ?? undefined,
  };
}

// ── DB insert builders ────────────────────────────────────────────────────

function buildTripInsert(form: TripForm, userId: string, profile: UserProfile) {
  const boardLocation =
    form.shortboards > 0 || form.longboards > 0 ? form.boardLocation : "無需載板";
  return {
    driver_id: userId,
    driver_name: profile.displayName,
    driver_rating: profile.rating,
    driver_completed_trips: profile.completedTrips,
    driver_cancellations_90d: profile.cancellations90d,
    date: form.date,
    destination: form.destination,
    departure_area: form.departureArea,
    departure_time: `${form.departureTime} ${form.departureMode}`,
    return_time:
      form.tripType === "只去程"
        ? "無回程"
        : form.returnMode === "現場討論"
          ? "現場討論"
          : `${form.returnMode} ${form.returnTime}`,
    trip_type: form.tripType,
    route: form.route,
    pickup_mode: form.pickupMode ? "沿路可接" : "固定集合",
    seats_left: form.maxPassengers,
    max_passengers: form.maxPassengers,
    shortboards: form.shortboards,
    longboards: form.longboards,
    board_location: boardLocation,
    price: form.price,
    status: "open",
    rules: form.rules,
    note: form.note,
    exact_pickup: form.exactPickup || null,
    line_id: profile.lineId ?? null,
  };
}

export default function Home() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();

  // ── persistent state (DB-backed) ──────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [myTrip, setMyTrip] = useState<Trip | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [passengerRequests, setPassengerRequests] = useState<PassengerRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tripReviews, setTripReviews] = useState<TripReview[]>([]);
  const [savedTripIds, setSavedTripIds] = useState<Set<string>>(new Set());
  const [reviewedTripIds, setReviewedTripIds] = useState<Set<string>>(new Set());
  const [ratedPassengerAppIds, setRatedPassengerAppIds] = useState<Set<string>>(new Set());

  // ── UI-only state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("find");
  const [findMode, setFindMode] = useState<FindMode>("trips");
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showRequestCreate, setShowRequestCreate] = useState(false);
  const [showEditTrip, setShowEditTrip] = useState(false);
  const [showCancelTripConfirm, setShowCancelTripConfirm] = useState(false);
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState(1);
  const [cancelApplicationId, setCancelApplicationId] = useState<string | null>(null);
  const [invitedRequestIds, setInvitedRequestIds] = useState<Set<string>>(new Set());
  const [ratingTarget, setRatingTarget] = useState<{
    tripId: string;
    tripDate: string;
    tripDestination: string;
    targetName: string;
    targetId: string;
    applicationId?: string;
  } | null>(null);
  const [showMarkCompleteConfirm, setShowMarkCompleteConfirm] = useState(false);
  const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);
  const [revealForm, setRevealForm] = useState({ exactPickup: "", lineId: "" });
  const [filters, setFilters] = useState({
    date: "",
    destination: "",
    departure: "",
    board: "",
    maxPrice: "",
  });
  const [applyForm, setApplyForm] = useState({
    pickupArea: "",
    flexiblePickup: false,
    board: "none" as BoardType,
    lineId: "",
    note: "",
  });
  const [requestForm, setRequestForm] = useState({
    date: "2026-06-13",
    destination: "烏石港（北堤）",
    departureArea: "永和",
    routeFlexibility: "可配合司機",
    tripType: "去回程",
    outboundTime: "06:00-06:30",
    returnTime: "現場討論",
    board: "short" as BoardType,
    acceptablePrice: 250,
    lineId: "my-line-id",
    note: "有板袋，可配合上車點。",
  });
  const [newTrip, setNewTrip] = useState<TripForm>(defaultTripForm);
  const [editTripForm, setEditTripForm] = useState<TripForm>(defaultTripForm);

  // ── Data loading ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let notifChannel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      // Profile
      const { data: pd, error: pErr } = await supabase
        .from("profiles").select("*").eq("id", user!.id).single();
      
      if (pd) {
        setProfile(mapUserProfile(pd as Record<string, unknown>));
      } else {
        // 如果找不到 Profile（例如新用戶），自動幫他建立一筆
        const defaultName = user!.user_metadata?.full_name || user!.user_metadata?.name || user!.email?.split("@")[0] || "新手衝浪客";
        const newProfile = {
          id: user!.id,
          display_name: defaultName,
          rating: 0,
          completed_trips: 0,
          cancellations_90d: 0,
        };
        const { data: newPd } = await supabase.from("profiles").insert(newProfile).select().single();
        if (newPd) {
          setProfile(mapUserProfile(newPd as Record<string, unknown>));
        }
      }

      // Other people's trips (exclude own driver trips)
      const { data: td } = await supabase
        .from("trips").select("*")
        .neq("driver_id", user!.id)
        .order("date", { ascending: true });
      if (td) setTrips(td.map((r) => mapTrip(r as Record<string, unknown>)));

      // My active posted trip
      const { data: mt } = await supabase
        .from("trips").select("*")
        .eq("driver_id", user!.id)
        .not("status", "in", "(completed,cancelled)")
        .order("created_at", { ascending: false })
        .limit(1);
      setMyTrip(mt && mt.length > 0 ? mapTrip(mt[0] as Record<string, unknown>) : null);

      // Applications (RLS returns own + driver's trip applications combined)
      const { data: ad } = await supabase
        .from("applications").select("*")
        .order("created_at", { ascending: false });
      if (ad) setApplications(ad.map((r) => mapApplication(r as Record<string, unknown>)));

      // Passenger requests
      const { data: prd } = await supabase
        .from("passenger_requests").select("*")
        .order("date", { ascending: true });
      if (prd) setPassengerRequests(prd.map((r) => mapPassengerRequest(r as Record<string, unknown>)));

      // Notifications
      const { data: nd } = await supabase
        .from("notifications").select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (nd) setNotifications(nd.map((r) => mapNotification(r as Record<string, unknown>)));

      // Trip reviews
      const { data: rd } = await supabase
        .from("trip_reviews").select("*")
        .eq("reviewer_id", user!.id);
      if (rd) setTripReviews(rd.map((r) => mapTripReview(r as Record<string, unknown>)));

      // Saved trips
      const { data: sd } = await supabase
        .from("saved_trips").select("trip_id")
        .eq("user_id", user!.id);
      if (sd) setSavedTripIds(new Set(sd.map((r) => r.trip_id as string)));

      // Realtime: notifications
      notifChannel = supabase
        .channel(`notif:${user!.id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "notifications",
          filter: `user_id=eq.${user!.id}`,
        }, (payload) => {
          setNotifications((cur) => [
            mapNotification(payload.new as Record<string, unknown>),
            ...cur,
          ]);
        })
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "notifications",
          filter: `user_id=eq.${user!.id}`,
        }, (payload) => {
          setNotifications((cur) =>
            cur.map((n) =>
              n.id === (payload.new as Record<string, unknown>).id
                ? mapNotification(payload.new as Record<string, unknown>)
                : n,
            ),
          );
        })
        .subscribe();
    }

    load();
    return () => {
      if (notifChannel) supabase.removeChannel(notifChannel);
    };
  }, [user]);

  const filteredTrips = useMemo(() => {
    const candidates =
      myTrip !== null &&
      myTrip.status !== "completed" &&
      myTrip.status !== "cancelled" &&
      myTrip.date >= TODAY
        ? [...trips, myTrip]
        : trips;
    return candidates.filter((trip) => {
      if (trip.status === "completed" || trip.status === "cancelled") return false;
      if (trip.date < TODAY) return false;
      const matchesDate = !filters.date || trip.date === filters.date;
      const matchesDestination =
        !filters.destination || trip.destination === filters.destination;
      const matchesDeparture =
        !filters.departure || trip.departureArea.includes(filters.departure);
      const matchesBoard =
        !filters.board ||
        filters.board === "none" ||
        (filters.board === "short" && trip.shortboards > 0) ||
        (filters.board === "long" && trip.longboards > 0);
      const matchesPrice =
        !filters.maxPrice || trip.price <= Number(filters.maxPrice);
      return (
        matchesDate &&
        matchesDestination &&
        matchesDeparture &&
        matchesBoard &&
        matchesPrice
      );
    });
  }, [filters, trips, myTrip]);

  const filteredPassengerRequests = useMemo(() => {
    return passengerRequests.filter((request) => {
      if (request.status === "cancelled") return false;
      if (request.date < TODAY) return false;
      const matchesDate = !filters.date || request.date === filters.date;
      const matchesDestination =
        !filters.destination || request.destination === filters.destination;
      const matchesDeparture =
        !filters.departure || request.departureArea.includes(filters.departure);
      const matchesBoard = !filters.board || request.board === filters.board;
      const matchesPrice =
        !filters.maxPrice || request.acceptablePrice <= Number(filters.maxPrice);
      return (
        matchesDate &&
        matchesDestination &&
        matchesDeparture &&
        matchesBoard &&
        matchesPrice
      );
    });
  }, [filters, passengerRequests]);

  // ── Helpers ──────────────────────────────────────────────────────────

  async function addNotification(text: string, type: Notification["type"] = "info") {
    if (!user) return;
    await supabase.from("notifications").insert({ user_id: user.id, text, type });
    // Realtime subscription will update local state
  }

  async function sendNotificationTo(userId: string, text: string, type: Notification["type"] = "info") {
    await supabase.rpc("send_notification", { p_user_id: userId, p_text: text, p_type: type });
  }

  async function markNotificationRead(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((cur) => cur.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  async function applyToTrip() {
    if (!selectedTrip || !user || !profile) return;
    const insert = {
      trip_id: selectedTrip.id,
      passenger_id: user.id,
      passenger_name: profile.displayName,
      pickup_area: applyForm.flexiblePickup ? "可配合司機" : applyForm.pickupArea || "未填",
      board: applyForm.board,
      line_id: applyForm.lineId || "",
      note: applyForm.note || "",
    };
    const { data, error } = await supabase
      .from("applications").insert(insert).select().single();
    if (error || !data) return;
    setApplications((cur) => [mapApplication(data as Record<string, unknown>), ...cur]);
    await addNotification(
      `已送出申請至 ${selectedTrip.driver} 的 ${selectedTrip.destination} 行程，等待審核中。`,
      "info",
    );
    await sendNotificationTo(
      selectedTrip.driverId,
      `${profile.displayName} 申請加入你的 ${selectedTrip.destination} 行程。`,
      "action",
    );
    setShowApply(false);
    setSelectedTrip(null);
    setActiveTab("trips");
  }

  async function publishTrip() {
    if (!user || !profile) return;
    const { data, error } = await supabase
      .from("trips").insert(buildTripInsert(newTrip, user.id, profile)).select().single();
    if (error || !data) return;
    setMyTrip(mapTrip(data as Record<string, unknown>));
    setShowCreate(false);
    setCreateStep(1);
    setActiveTab("find");
  }

  function openRevealSheet(applicationId: string) {
    setRevealForm({
      exactPickup: myTrip?.exactPickup ?? "",
      lineId: myTrip?.lineId ?? "",
    });
    setPendingAcceptId(applicationId);
  }

  async function confirmAccept() {
    if (!pendingAcceptId || !myTrip) return;
    // Update trip's exact pickup + line_id
    const { data: updatedTrip } = await supabase
      .from("trips")
      .update({ exact_pickup: revealForm.exactPickup, line_id: revealForm.lineId })
      .eq("id", myTrip.id)
      .select().single();
    if (updatedTrip) setMyTrip(mapTrip(updatedTrip as Record<string, unknown>));
    await decideApplication(pendingAcceptId, "accepted");
    setPendingAcceptId(null);
  }

  async function decideApplication(id: string, status: "accepted" | "rejected") {
    const application = applications.find((a) => a.id === id);
    const { error } = await supabase
      .from("applications").update({ status }).eq("id", id);
    if (error) return;
    setApplications((cur) => cur.map((a) => (a.id === id ? { ...a, status } : a)));

    if (status === "accepted" && myTrip) {
      const newSeatsLeft = Math.max(0, myTrip.seatsLeft - 1);
      const newStatus = newSeatsLeft === 0 ? "full" : myTrip.status;
      await supabase.from("trips").update({ seats_left: newSeatsLeft, status: newStatus }).eq("id", myTrip.id);
      setMyTrip((cur) => cur ? { ...cur, seatsLeft: newSeatsLeft, status: newStatus } : null);
    }

    if (application) {
      if (status === "accepted") {
        await addNotification(`你接受了 ${application.passenger} 的申請，已開放精確集合點。`, "info");
        await sendNotificationTo(application.passengerId, `你的申請已被接受！查看集合點與聯絡方式。`, "action");
      } else {
        await addNotification(`你拒絕了 ${application.passenger} 的申請。`, "info");
        await sendNotificationTo(application.passengerId, `你的申請未獲接受，可繼續找其他共乘。`, "info");
      }
    }
  }

  async function publishPassengerRequest() {
    if (!user || !profile) return;
    const insert = {
      passenger_id: user.id,
      passenger_name: profile.displayName,
      passenger_rating: profile.rating,
      passenger_completed_trips: profile.completedTrips,
      passenger_cancellations_90d: profile.cancellations90d,
      date: requestForm.date,
      destination: requestForm.destination,
      departure_area: requestForm.departureArea,
      route_flexibility: requestForm.routeFlexibility,
      trip_type: requestForm.tripType,
      outbound_time: requestForm.tripType === "只回程" ? "無去程" : requestForm.outboundTime,
      return_time: requestForm.tripType === "只去程" ? "無回程" : requestForm.returnTime,
      board: requestForm.board,
      acceptable_price: requestForm.acceptablePrice,
      line_id: requestForm.lineId,
      note: requestForm.note,
    };
    const { data, error } = await supabase
      .from("passenger_requests").insert(insert).select().single();
    if (error || !data) return;
    setPassengerRequests((cur) => [mapPassengerRequest(data as Record<string, unknown>), ...cur]);
    setShowRequestCreate(false);
    setFindMode("requests");
    setActiveTab("find");
  }

  function openEditTrip() {
    if (!myTrip) return;
    const dep = myTrip.departureTime;
    const depParts = dep.split(" ");
    const depTime = depParts[0] ?? "06:00";
    const depModePart = depParts.slice(1).join(" ");
    const depMode =
      depModePart === "準時出發" ? "準時出發"
      : depModePart === "彈性出發" ? "彈性區間"
      : "準時出發";
    const ret = myTrip.returnTime;
    let retMode = "現場討論";
    let retTime = "";
    if (ret === "現場討論" || ret === "無回程") {
      retMode = "現場討論";
    } else if (ret.startsWith("約略")) {
      retMode = "約略時間";
      retTime = ret.replace("約略 ", "");
    } else if (ret.startsWith("固定")) {
      retMode = "固定時間";
      retTime = ret.replace("固定 ", "");
    } else {
      retMode = "固定時間";
      retTime = ret;
    }
    setEditTripForm({
      date: myTrip.date, destination: myTrip.destination, departureArea: myTrip.departureArea,
      exactPickup: myTrip.exactPickup ?? "", route: myTrip.route,
      pickupMode: myTrip.pickupMode === "沿路可接", tripType: myTrip.tripType,
      departureMode: depMode, departureTime: depTime, returnMode: retMode, returnTime: retTime,
      maxPassengers: myTrip.maxPassengers, shortboards: myTrip.shortboards, longboards: myTrip.longboards,
      boardLocation: myTrip.boardLocation === "無需載板" ? "都可" : myTrip.boardLocation,
      vehicle: "", price: myTrip.price, rules: [...myTrip.rules], note: myTrip.note,
    });
    setShowEditTrip(true);
  }

  async function saveEditedTrip() {
    if (!myTrip) return;
    const boardLocation =
      editTripForm.shortboards > 0 || editTripForm.longboards > 0
        ? editTripForm.boardLocation : "無需載板";
    const patch = {
      date: editTripForm.date, destination: editTripForm.destination,
      departure_area: editTripForm.departureArea,
      departure_time: `${editTripForm.departureTime} ${editTripForm.departureMode}`,
      return_time: editTripForm.tripType === "只去程" ? "無回程"
        : editTripForm.returnMode === "現場討論" ? "現場討論"
        : `${editTripForm.returnMode} ${editTripForm.returnTime}`,
      trip_type: editTripForm.tripType, route: editTripForm.route,
      pickup_mode: editTripForm.pickupMode ? "沿路可接" : "固定集合",
      max_passengers: editTripForm.maxPassengers, seats_left: editTripForm.maxPassengers,
      shortboards: editTripForm.shortboards, longboards: editTripForm.longboards,
      board_location: boardLocation, price: editTripForm.price,
      rules: editTripForm.rules, note: editTripForm.note,
      exact_pickup: editTripForm.exactPickup || null,
    };
    const { data, error } = await supabase
      .from("trips").update(patch).eq("id", myTrip.id).select().single();
    if (error || !data) return;
    setMyTrip(mapTrip(data as Record<string, unknown>));
    await addNotification(`你修改了 ${editTripForm.destination} 行程的資訊，所有申請者已收到通知。`, "info");
    setShowEditTrip(false);
  }

  async function confirmCancelTrip() {
    if (!myTrip) return;
    const affected = applications.filter(
      (a) => a.tripId === myTrip.id && (a.status === "pending" || a.status === "accepted"),
    );
    await supabase.from("trips").update({ status: "cancelled" }).eq("id", myTrip.id);
    await supabase.from("applications").update({ status: "cancelled" }).eq("trip_id", myTrip.id);
    setMyTrip((cur) => cur ? { ...cur, status: "cancelled" } : null);
    setApplications((cur) => cur.map((a) => a.tripId === myTrip.id ? { ...a, status: "cancelled" } : a));
    for (const app of affected) {
      await sendNotificationTo(app.passengerId,
        `${myTrip.driver} 取消了 ${myTrip.date.replace("2026-","")} ${myTrip.destination} 行程，你的申請已自動取消。`,
        "alert");
    }
    await addNotification(
      `你取消了 ${myTrip.destination} 行程${affected.length > 0 ? `，已通知 ${affected.length} 名申請者` : ""}。`,
      "alert",
    );
    setShowCancelTripConfirm(false);
  }

  async function cancelPassengerRequest(id: string) {
    const request = passengerRequests.find((r) => r.id === id);
    await supabase.from("passenger_requests").update({ status: "cancelled" }).eq("id", id);
    setPassengerRequests((cur) => cur.map((r) => r.id === id ? { ...r, status: "cancelled" } : r));
    if (request) await addNotification(`你取消了 ${request.destination} 的找車需求。`, "info");
    setCancelRequestId(null);
  }

  async function submitReview(rating: number, text: string) {
    if (!ratingTarget || !user) return;
    const insert = {
      reviewer_id: user.id,
      target_id: ratingTarget.targetId,
      target_name: ratingTarget.targetName,
      trip_id: ratingTarget.tripId,
      trip_date: ratingTarget.tripDate,
      trip_destination: ratingTarget.tripDestination,
      rating,
      text,
    };
    const { data, error } = await supabase.from("trip_reviews").insert(insert).select().single();
    if (error || !data) return;
    setTripReviews((cur) => [mapTripReview(data as Record<string, unknown>), ...cur]);
    if (ratingTarget.applicationId !== undefined) {
      setRatedPassengerAppIds((cur) => new Set([...cur, ratingTarget.applicationId!]));
      await addNotification(`你已為乘客 ${ratingTarget.targetName} 留下評價。`, "info");
    } else {
      setReviewedTripIds((cur) => new Set([...cur, ratingTarget.tripId]));
      await addNotification(`你已為 ${ratingTarget.targetName} 的 ${ratingTarget.tripDestination} 行程留下評價。`, "info");
    }
    setRatingTarget(null);
  }

  async function confirmMarkComplete() {
    if (!myTrip) return;
    const accepted = applications.filter((a) => a.tripId === myTrip.id && a.status === "accepted");
    await supabase.from("trips").update({ status: "completed" }).eq("id", myTrip.id);
    await supabase.from("applications").update({ status: "cancelled" })
      .eq("trip_id", myTrip.id).eq("status", "pending");
    setMyTrip((cur) => cur ? { ...cur, status: "completed" } : null);
    setApplications((cur) => cur.map((a) =>
      a.tripId === myTrip.id && a.status === "pending" ? { ...a, status: "cancelled" } : a));
    await addNotification(
      `${myTrip.destination} 行程已完成${accepted.length > 0 ? `，可以為 ${accepted.length} 名乘客留下評價` : ""}。`,
      "info",
    );
    setShowMarkCompleteConfirm(false);
  }

  function simulateExternalTripCancelled(tripId: string) {
    const trip = trips.find((t) => t.id === tripId);
    setTrips((cur) => cur.map((t) => t.id === tripId ? { ...t, status: "cancelled" } : t));
    setApplications((cur) => cur.map((a) =>
      a.passengerId === user?.id && a.tripId === tripId ? { ...a, status: "cancelled" } : a));
    if (trip) {
      const dateShort = trip.date.replace("2026-", "");
      void addNotification(`${trip.driver} 取消了 ${dateShort} ${trip.destination} 行程，你的申請已自動取消。`, "alert");
    }
  }

  async function cancelApplication(id: string) {
    const application = applications.find((a) => a.id === id);
    await supabase.from("applications").update({ status: "cancelled" }).eq("id", id);
    setApplications((cur) => cur.map((a) => a.id === id ? { ...a, status: "cancelled" } : a));
    if (application) {
      const trip = [...trips, ...(myTrip ? [myTrip] : [])].find((t) => t.id === application.tripId);
      await addNotification(`你取消了 ${trip?.destination ?? "該行程"} 的申請，司機已收到通知。`, "info");
      await sendNotificationTo(application.tripId, `${application.passenger} 取消了申請。`, "info");
    }
    setCancelApplicationId(null);
  }

  function inviteToTrip(requestId: string) {
    setInvitedRequestIds((cur) => new Set([...cur, requestId]));
  }

  async function toggleSaveTrip(tripId: string) {
    if (!user) return;
    if (savedTripIds.has(tripId)) {
      await supabase.from("saved_trips").delete().match({ user_id: user.id, trip_id: tripId });
      setSavedTripIds((cur) => { const next = new Set(cur); next.delete(tripId); return next; });
    } else {
      await supabase.from("saved_trips").insert({ user_id: user.id, trip_id: tripId });
      setSavedTripIds((cur) => new Set([...cur, tripId]));
    }
  }

  function openCreateTripFromFilters() {
    setNewTrip({
      ...newTrip,
      date: filters.date || newTrip.date,
      destination: filters.destination || newTrip.destination,
      departureArea: filters.departure || newTrip.departureArea,
      price: filters.maxPrice ? Number(filters.maxPrice) || newTrip.price : newTrip.price,
    });
    setShowCreate(true);
  }

  function openCreateRequestFromFilters() {
    setRequestForm({
      ...requestForm,
      date: filters.date || requestForm.date,
      destination: filters.destination || requestForm.destination,
      departureArea: filters.departure || requestForm.departureArea,
      board: filters.board ? (filters.board as BoardType) : requestForm.board,
      acceptablePrice: filters.maxPrice
        ? Number(filters.maxPrice) || requestForm.acceptablePrice
        : requestForm.acceptablePrice,
    });
    setShowRequestCreate(true);
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const cancellingRequest = passengerRequests.find((r) => r.id === cancelRequestId) ?? null;

  // ── Auth gates ──────────────────────────────────────────────────────
  if (authLoading || (user && !profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#edf3f7]">
        <p className="text-slate-500">載入中…</p>
      </div>
    );
  }
  if (!user) {
    return <LoginScreen onSignIn={signInWithGoogle} />;
  }

  return (
    <main className="min-h-screen bg-[#edf3f7] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-[#f8fafc] shadow-2xl shadow-slate-300/60">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f8fafc]/95 px-5 pb-3 pt-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-teal-700">台灣衝浪共乘</p>
              <h1 className="text-2xl font-bold tracking-normal">浪乘</h1>
            </div>
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm"
              onClick={() => setActiveTab("profile")}
            >
              {profile?.displayName ?? user.email ?? "我"}
            </button>
          </div>
        </header>

        <section className="relative flex-1 overflow-hidden">
          {activeTab === "find" && (
            <FindTrips
              mode={findMode}
              setMode={setFindMode}
              filters={filters}
              setFilters={setFilters}
              trips={filteredTrips}
              requests={filteredPassengerRequests}
              onSelect={setSelectedTrip}
              invitedRequestIds={invitedRequestIds}
              onInvite={inviteToTrip}
              savedTripIds={savedTripIds}
              onToggleSave={toggleSaveTrip}
              currentUserId={user.id}
            />
          )}
          {activeTab === "trips" && (
            <MyTrips
              myTrip={myTrip}
              userId={user.id}
              allTrips={[...trips, ...(myTrip ? [myTrip] : [])]}

              passengerRequests={passengerRequests}
              applications={applications}
              reviewedTripIds={reviewedTripIds}
              savedTripIds={savedTripIds}
              onToggleSave={toggleSaveTrip}
              onReveal={openRevealSheet}
              onDecide={decideApplication}
              onEditTrip={openEditTrip}
              onCancelTrip={() => setShowCancelTripConfirm(true)}
              onCancelRequest={(id) => setCancelRequestId(id)}
              onCancelApplication={(id) => setCancelApplicationId(id)}
              ratedPassengerAppIds={ratedPassengerAppIds}
              onMarkComplete={() => setShowMarkCompleteConfirm(true)}
              onRate={(tripId, tripDate, tripDestination, targetName, targetId) =>
                setRatingTarget({ tripId, tripDate, tripDestination, targetName, targetId })
              }
              onRatePassenger={(applicationId, passengerName, passengerId) =>
                setRatingTarget({
                  tripId: myTrip?.id ?? "",
                  tripDate: myTrip?.date ?? "",
                  tripDestination: myTrip?.destination ?? "",
                  targetName: passengerName,
                  targetId: passengerId,
                  applicationId,
                })
              }
              onSimulateTripCancelled={simulateExternalTripCancelled}
            />
          )}
          {activeTab === "notifications" && (
            <Notifications
              notifications={notifications}
              onMarkRead={markNotificationRead}
            />
          )}
          {activeTab === "profile" && (
            <Profile tripReviews={tripReviews} profile={profile} onSignOut={signOut} />
          )}

          {activeTab === "find" && (
            <button
              aria-label="發車"
              className="absolute bottom-24 right-5 z-10 grid h-14 w-14 place-items-center rounded-full bg-teal-600 text-3xl font-light text-white shadow-xl shadow-teal-700/30"
              onClick={() =>
                findMode === "trips"
                  ? openCreateTripFromFilters()
                  : openCreateRequestFromFilters()
              }
            >
              +
            </button>
          )}
        </section>

        <nav className="sticky bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white px-2 py-2">
          {(
            [
              ["find", "找車"],
              ["trips", "我的行程"],
              ["notifications", "通知"],
              ["profile", "個人"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`relative rounded-xl px-2 py-2 text-sm font-semibold ${
                activeTab === key
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-500"
              }`}
              onClick={() => setActiveTab(key)}
            >
              {label}
              {key === "notifications" && unreadCount > 0 && (
                <span className="absolute right-2 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {selectedTrip && (
        <TripDetail
          trip={selectedTrip}
          onClose={() => setSelectedTrip(null)}
          onApply={() => setShowApply(true)}
        />
      )}
      {showApply && selectedTrip && (
        <ApplySheet
          trip={selectedTrip}
          form={applyForm}
          setForm={setApplyForm}
          onClose={() => setShowApply(false)}
          onSubmit={applyToTrip}
        />
      )}
      {showCreate && (
        <CreateTripSheet
          step={createStep}
          setStep={setCreateStep}
          trip={newTrip}
          setTrip={setNewTrip}
          onClose={() => setShowCreate(false)}
          onPublish={publishTrip}
        />
      )}
      {showRequestCreate && (
        <CreatePassengerRequestSheet
          request={requestForm}
          setRequest={setRequestForm}
          onClose={() => setShowRequestCreate(false)}
          onPublish={publishPassengerRequest}
        />
      )}
      {showEditTrip && (
        <EditTripSheet
          form={editTripForm}
          setForm={setEditTripForm}
          onClose={() => setShowEditTrip(false)}
          onSave={saveEditedTrip}
        />
      )}
      {pendingAcceptId !== null && (() => {
        const app = applications.find((a) => a.id === pendingAcceptId);
        return app ? (
          <RevealSheet
            passengerName={app.passenger}
            pickupArea={app.pickupArea}
            board={app.board}
            form={revealForm}
            setForm={setRevealForm}
            onClose={() => setPendingAcceptId(null)}
            onConfirm={confirmAccept}
          />
        ) : null;
      })()}
      {showMarkCompleteConfirm && (
        <ConfirmSheet
          title="標記行程為已完成"
          message={`確定要將 ${myTrip?.destination ?? "此"} 行程標記為已完成嗎？待審核的申請會自動作廢，完成後可以為乘客留下評價。`}
          confirmLabel="確認完成"
          onConfirm={confirmMarkComplete}
          onClose={() => setShowMarkCompleteConfirm(false)}
        />
      )}
      {showCancelTripConfirm && (
        <ConfirmSheet
          title="確認取消行程"
          message={`確定要取消 ${myTrip?.destination ?? "此"} 行程嗎？所有已申請的乘客都會收到取消通知，此操作無法復原。`}
          confirmLabel="確認取消"
          onConfirm={confirmCancelTrip}
          onClose={() => setShowCancelTripConfirm(false)}
        />
      )}
      {cancelRequestId !== null && cancellingRequest !== null && (
        <ConfirmSheet
          title="確認取消需求"
          message={`確定要取消 ${cancellingRequest.destination} 的找車需求嗎？此需求會從需求牆下架。`}
          confirmLabel="確認取消"
          onConfirm={() => cancelPassengerRequest(cancelRequestId)}
          onClose={() => setCancelRequestId(null)}
        />
      )}
      {cancelApplicationId !== null && (
        <ConfirmSheet
          title="確認取消申請"
          message="確定要取消這筆申請嗎？司機會收到取消通知，已核准的申請取消後無法復原。"
          confirmLabel="確認取消"
          onConfirm={() => cancelApplication(cancelApplicationId)}
          onClose={() => setCancelApplicationId(null)}
        />
      )}
      {ratingTarget !== null && (
        <RatingSheet
          targetName={ratingTarget.targetName}
          tripDate={ratingTarget.tripDate}
          tripDestination={ratingTarget.tripDestination}
          onClose={() => setRatingTarget(null)}
          onSubmit={submitReview}
        />
      )}
    </main>
  );
}

function FindTrips({
  mode,
  setMode,
  filters,
  setFilters,
  trips,
  requests,
  onSelect,
  invitedRequestIds,
  onInvite,
  savedTripIds,
  onToggleSave,
  currentUserId,
}: {
  mode: FindMode;
  setMode: (mode: FindMode) => void;
  filters: {
    date: string;
    destination: string;
    departure: string;
    board: string;
    maxPrice: string;
  };
  setFilters: (filters: {
    date: string;
    destination: string;
    departure: string;
    board: string;
    maxPrice: string;
  }) => void;
  trips: Trip[];
  requests: PassengerRequest[];
  onSelect: (trip: Trip) => void;
  invitedRequestIds: Set<string>;
  onInvite: (id: string) => void;
  savedTripIds: Set<string>;
  onToggleSave: (id: string) => void;
  currentUserId: string;
}) {
  return (
    <div className="space-y-4 overflow-y-auto px-5 py-4 pb-28" style={{ maxHeight: "calc(100vh - 140px)" }}>
      <div className="grid grid-cols-2 rounded-2xl bg-slate-200 p-1 text-sm font-bold">
        <button
          className={`rounded-xl py-2 ${
            mode === "trips"
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-500"
          }`}
          onClick={() => setMode("trips")}
        >
          司機徵乘客
        </button>
        <button
          className={`rounded-xl py-2 ${
            mode === "requests"
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-500"
          }`}
          onClick={() => setMode("requests")}
        >
          乘客徵司機
        </button>
      </div>

      <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {mode === "trips" ? "搜尋已開的共乘" : "搜尋乘客徵司機"}
          </h2>
          {(filters.date || filters.destination || filters.departure || filters.board || filters.maxPrice) ? (
            <button
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
              onClick={() =>
                setFilters({ date: "", destination: "", departure: "", board: "", maxPrice: "" })
              }
            >
              清除篩選
            </button>
          ) : (
            <span className="text-sm font-semibold text-slate-400">今天以後</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            type="date"
            value={filters.date}
            onChange={(event) =>
              setFilters({ ...filters, date: event.target.value })
            }
          />
          <select
            className="input"
            value={filters.destination}
            onChange={(event) =>
              setFilters({ ...filters, destination: event.target.value })
            }
          >
            <option value="">目的地</option>
            {surfSpots.map((spot) => (
              <option key={spot}>{spot}</option>
            ))}
          </select>
          <input
            className="input"
            placeholder="出發地區"
            value={filters.departure}
            onChange={(event) =>
              setFilters({ ...filters, departure: event.target.value })
            }
          />
          <select
            className="input"
            value={filters.board}
            onChange={(event) =>
              setFilters({ ...filters, board: event.target.value })
            }
          >
            <option value="">板型</option>
            <option value="none">無板</option>
            <option value="short">短板</option>
            <option value="long">長板</option>
          </select>
          <input
            className="input col-span-2"
            inputMode="numeric"
            placeholder="價格上限"
            value={filters.maxPrice}
            onChange={(event) =>
              setFilters({ ...filters, maxPrice: event.target.value })
            }
          />
        </div>
      </div>

      {mode === "trips" &&
        trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onSelect={onSelect}
            isSaved={savedTripIds.has(trip.id)}
            onToggleSave={onToggleSave}
            currentUserId={currentUserId}
          />
        ))}
      {mode === "requests" &&
        requests.map((request) => (
          <PassengerRequestCard
            key={request.id}
            request={request}
            invited={invitedRequestIds.has(request.id)}
            onInvite={onInvite}
            currentUserId={currentUserId}
          />
        ))}
      {mode === "trips" && trips.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          目前沒有符合條件的共乘。可以按右下角 +，用這些搜尋條件發起共乘。
        </div>
      )}
      {mode === "requests" && requests.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          目前沒有符合條件的徵司機需求。可以按右下角 +，用這些搜尋條件發布找車需求。
        </div>
      )}
    </div>
  );
}

function TripCard({
  trip,
  onSelect,
  isSaved = false,
  onToggleSave,
  currentUserId,
}: {
  trip: Trip;
  onSelect: (trip: Trip) => void;
  isSaved?: boolean;
  onToggleSave?: (id: string) => void;
  currentUserId?: string;
}) {
  const isOwn = !!currentUserId && trip.driverId === currentUserId;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        isOwn ? "border-teal-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-teal-700">{trip.date}</p>
          <h3 className="mt-1 text-xl font-bold">
            {trip.departureArea} → {trip.destination}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {trip.departureTime} · {trip.tripType}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isOwn && (
            <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white">
              你發布
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              trip.status === "open"
                ? "bg-teal-50 text-teal-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {statusLabel[trip.status]}
          </span>
          {!isOwn && onToggleSave && (
            <button
              className={`mt-0.5 text-xl leading-none transition-colors ${
                isSaved ? "text-amber-400" : "text-slate-300 hover:text-amber-300"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave(trip.id);
              }}
              aria-label={isSaved ? "取消收藏" : "收藏行程"}
            >
              {isSaved ? "★" : "☆"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="每人" value={`$${trip.price}`} />
        <Metric label="剩餘" value={`${trip.seatsLeft} 位`} />
        <Metric label="評價" value={`${trip.rating}`} />
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{trip.note}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Tag>短板 {trip.shortboards}</Tag>
        <Tag>長板 {trip.longboards}</Tag>
        <Tag>{trip.boardLocation}</Tag>
        {trip.rules.slice(0, 2).map((rule) => (
          <Tag key={rule}>{rule}</Tag>
        ))}
      </div>

      {isOwn ? (
        <div className="mt-4 w-full rounded-xl bg-teal-50 py-3 text-center text-sm font-bold text-teal-700">
          你的行程 · 至「我的行程」頁管理
        </div>
      ) : (
        <button
          className="mt-4 w-full rounded-xl bg-slate-950 py-3 text-sm font-bold text-white disabled:bg-slate-300"
          disabled={trip.status !== "open"}
          onClick={() => onSelect(trip)}
        >
          查看與申請
        </button>
      )}
    </article>
  );
}

function PassengerRequestCard({
  request,
  invited,
  onInvite,
  currentUserId,
}: {
  request: PassengerRequest;
  invited: boolean;
  onInvite: (id: string) => void;
  currentUserId: string;
}) {
  const isOwnRequest = request.passengerId === currentUserId;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-teal-700">{request.date}</p>
          <h3 className="mt-1 text-xl font-bold">
            {request.departureArea} → {request.destination}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {request.passenger} · {request.tripType} · {boardLabel[request.board]}
          </p>
        </div>
        {isOwnRequest ? (
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
            我的需求
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            找車中
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="可接受" value={`$${request.acceptablePrice}`} />
        <Metric label="評價" value={`${request.rating}`} />
        <Metric label="完成" value={`${request.completedTrips} 次`} />
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
        <p>
          <span className="font-bold text-slate-700">去程：</span>
          {request.outboundTime}
        </p>
        <p>
          <span className="font-bold text-slate-700">回程：</span>
          {request.returnTime}
        </p>
        <p>
          <span className="font-bold text-slate-700">上車彈性：</span>
          {request.routeFlexibility}
        </p>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{request.note}</p>

      {!isOwnRequest && (
        <button
          className={`mt-4 w-full rounded-xl py-3 text-sm font-bold ${
            invited ? "bg-teal-50 text-teal-700" : "bg-slate-950 text-white"
          }`}
          onClick={() => !invited && onInvite(request.id)}
        >
          {invited ? "已送出邀請" : "邀請加入我的行程"}
        </button>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
      {children}
    </span>
  );
}

function MyTrips({
  myTrip,
  userId,
  allTrips,
  passengerRequests,
  applications,
  reviewedTripIds,
  ratedPassengerAppIds,
  savedTripIds,
  onToggleSave,
  onReveal,
  onDecide,
  onEditTrip,
  onCancelTrip,
  onMarkComplete,
  onCancelRequest,
  onCancelApplication,
  onRate,
  onRatePassenger,
  onSimulateTripCancelled,
}: {
  myTrip: Trip | null;
  userId: string;
  allTrips: Trip[];
  passengerRequests: PassengerRequest[];
  applications: Application[];
  reviewedTripIds: Set<string>;
  ratedPassengerAppIds: Set<string>;
  savedTripIds: Set<string>;
  onToggleSave: (id: string) => void;
  onReveal: (id: string) => void;
  onDecide: (id: string, status: "accepted" | "rejected") => void;
  onEditTrip: () => void;
  onCancelTrip: () => void;
  onMarkComplete: () => void;
  onCancelRequest: (id: string) => void;
  onCancelApplication: (id: string) => void;
  onRate: (tripId: string, tripDate: string, tripDestination: string, targetName: string, targetId: string) => void;
  onRatePassenger: (applicationId: string, passengerName: string, passengerId: string) => void;
  onSimulateTripCancelled: (tripId: string) => void;
}) {
  const myRequests = passengerRequests.filter((request) => request.passengerId === userId);
  const myApplications = applications.filter(
    (a) => a.passengerId === userId && a.status !== "cancelled",
  );
  const incomingApplications = applications.filter(
    (a) => myTrip !== null && a.tripId === myTrip.id && a.passengerId !== userId && a.status !== "cancelled",
  );

  return (
    <div className="space-y-4 overflow-y-auto px-5 py-4 pb-28" style={{ maxHeight: "calc(100vh - 140px)" }}>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {myTrip === null ? (
          <div className="py-4 text-center">
            <p className="text-sm font-semibold text-slate-500">你還沒有發布行程</p>
            <p className="mt-1 text-xs text-slate-400">在「找車」頁按右下角 + 發起共乘</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-teal-700">我發起的行程</p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                myTrip.status === "open" ? "bg-teal-50 text-teal-700"
                : myTrip.status === "cancelled" ? "bg-red-50 text-red-700"
                : "bg-slate-100 text-slate-500"
              }`}>{statusLabel[myTrip.status]}</span>
            </div>
            <h2 className="mt-1 text-xl font-bold">{myTrip.departureArea} → {myTrip.destination}</h2>
            <p className="mt-2 text-sm text-slate-500">{myTrip.date} · {myTrip.departureTime} · ${myTrip.price}/人</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Metric label="剩餘座位" value={`${myTrip.seatsLeft} 位`} />
              <Metric label="乘客上限" value={`${myTrip.maxPassengers} 位`} />
              <Metric label="已接受" value={`${myTrip.maxPassengers - myTrip.seatsLeft} 位`} />
            </div>
          </>
        )}
        {myTrip !== null && (myTrip.status === "cancelled" ? (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
            行程已取消。所有申請者已收到通知。
          </div>
        ) : myTrip.status === "completed" ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">
            行程已完成。可以在下方為乘客留下評價。
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-xl border border-slate-200 py-3 text-sm font-bold"
                onClick={onEditTrip}
              >
                修改行程
              </button>
              <button
                className="rounded-xl border border-red-100 bg-red-50 py-3 text-sm font-bold text-red-700"
                onClick={onCancelTrip}
              >
                取消行程
              </button>
            </div>
            <button
              className="w-full rounded-xl border border-teal-200 bg-teal-50 py-3 text-sm font-bold text-teal-700"
              onClick={onMarkComplete}
            >
              標記行程完成
            </button>
          </div>
        ))}
      </section>

      {myRequests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">我發布的找車需求</h2>
          {myRequests.map((request) => (
            <article
              key={request.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-teal-700">
                    {request.date}
                  </p>
                  <h3 className="mt-1 text-lg font-bold">
                    {request.departureArea} → {request.destination}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {request.tripType} · {boardLabel[request.board]} · $
                    {request.acceptablePrice}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                    request.status === "searching"
                      ? "bg-amber-50 text-amber-700"
                      : request.status === "matched"
                        ? "bg-teal-50 text-teal-700"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {request.status === "searching"
                    ? "找車中"
                    : request.status === "matched"
                      ? "已配對"
                      : request.status === "cancelled"
                        ? "已取消"
                        : "已過期"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {request.note}
              </p>
              {request.status === "searching" && (
                <button
                  className="mt-3 w-full rounded-xl border border-red-100 bg-red-50 py-2.5 text-sm font-bold text-red-700"
                  onClick={() => onCancelRequest(request.id)}
                >
                  取消需求
                </button>
              )}
              {request.status === "cancelled" && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                  需求已取消下架。
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {savedTripIds.size > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">收藏的行程</h2>
          {allTrips
            .filter((t) => savedTripIds.has(t.id) && t.driver !== "你")
            .map((trip) => (
              <article
                key={trip.id}
                className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-teal-700">{trip.date}</p>
                    <h3 className="mt-1 text-lg font-bold">
                      {trip.departureArea} → {trip.destination}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {trip.driver} · {trip.departureTime}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      trip.status === "open"
                        ? "bg-teal-50 text-teal-700"
                        : trip.status === "cancelled"
                          ? "bg-red-50 text-red-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {statusLabel[trip.status]}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric label="每人" value={`$${trip.price}`} />
                  <Metric label="剩餘" value={`${trip.seatsLeft} 位`} />
                  <Metric label="評價" value={`${trip.rating}`} />
                </div>
                {trip.status === "open" && (
                  <div className="mt-3 rounded-xl bg-teal-50 p-2.5 text-center text-sm font-bold text-teal-700">
                    已有空位！前往「找車」申請
                  </div>
                )}
                <button
                  className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-500"
                  onClick={() => onToggleSave(trip.id)}
                >
                  取消收藏
                </button>
              </article>
            ))}
        </section>
      )}

      {myApplications.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">我申請的共乘</h2>
          {myApplications.map((application) => {
            const trip = allTrips.find((t) => t.id === application.tripId);
            const isCompleted = trip?.status === "completed";
            const alreadyReviewed = reviewedTripIds.has(application.tripId);
            const tripCancelled = trip?.status === "cancelled";
            return (
              <article
                key={application.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  tripCancelled ? "border-red-100 opacity-70" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-teal-700">
                      {trip?.date ?? ""}
                    </p>
                    <h3 className="mt-1 text-lg font-bold">
                      {trip
                        ? `${trip.departureArea} → ${trip.destination}`
                        : "行程資訊不存在"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {trip?.driver} · {trip?.departureTime}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      tripCancelled
                        ? "bg-red-50 text-red-700"
                        : isCompleted
                          ? "bg-slate-100 text-slate-500"
                          : application.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : application.status === "accepted"
                              ? "bg-teal-50 text-teal-700"
                              : "bg-red-50 text-red-700"
                    }`}
                  >
                    {tripCancelled
                      ? "行程取消"
                      : isCompleted
                        ? "已完成"
                        : application.status === "pending"
                          ? "審核中"
                          : application.status === "accepted"
                            ? "已接受"
                            : "已拒絕"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric label="每人" value={`$${trip?.price ?? "-"}`} />
                  <Metric label="板型" value={boardLabel[application.board]} />
                  <Metric label="上車" value={application.pickupArea} />
                </div>

                {application.status === "accepted" && trip && !isCompleted && !tripCancelled && (
                  <div className="mt-3 space-y-2 rounded-xl bg-teal-50 p-3 text-sm leading-6">
                    <p className="font-bold text-teal-800">已接受——精確資訊已開放</p>
                    <p>
                      <span className="font-bold text-teal-700">集合點：</span>
                      <span className="text-teal-900">
                        {trip.exactPickup ?? "司機會另行告知"}
                      </span>
                    </p>
                    <p>
                      <span className="font-bold text-teal-700">Line ID：</span>
                      <span className="text-teal-900">{trip.lineId ?? "-"}</span>
                    </p>
                  </div>
                )}

                {application.status === "rejected" && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                    申請未獲接受。可以繼續找其他共乘。
                  </div>
                )}

                {tripCancelled && (
                  <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                    司機已取消此行程，你的申請已自動作廢。
                  </div>
                )}

                {isCompleted && !tripCancelled && trip && (
                  <div className="mt-3">
                    {alreadyReviewed ? (
                      <div className="rounded-xl bg-slate-50 p-3 text-center text-sm font-semibold text-slate-500">
                        已評價 · 感謝你的回饋
                      </div>
                    ) : (
                      <button
                        className="w-full rounded-xl bg-amber-400 py-3 text-sm font-bold text-white"
                        onClick={() =>
                          onRate(
                            trip.id,
                            trip.date,
                            trip.destination,
                            trip.driver,
                            trip.driverId,
                          )
                        }
                      >
                        留下評價
                      </button>
                    )}
                  </div>
                )}

                {application.status === "pending" && !tripCancelled && (
                  <button
                    className="mt-3 w-full rounded-xl border border-red-100 bg-red-50 py-2.5 text-sm font-bold text-red-700"
                    onClick={() => onCancelApplication(application.id)}
                  >
                    取消申請
                  </button>
                )}

                {!isCompleted && !tripCancelled && application.status !== "rejected" && (
                  <button
                    className="mt-2 w-full rounded-xl py-1.5 text-xs text-slate-300"
                    onClick={() => trip && onSimulateTripCancelled(trip.id)}
                  >
                    ＊ demo 用：模擬司機取消此行程
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          {myTrip?.status === "completed" ? "行程乘客" : "待審核申請"}
        </h2>
        {incomingApplications.length === 0 && (
          <p className="text-sm text-slate-400">目前沒有申請。</p>
        )}
        {incomingApplications.map((application) => (
          <article
            key={application.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">{application.passenger}</h3>
                <p className="text-sm text-slate-500">
                  {application.pickupArea} · {boardLabel[application.board]}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {application.status === "pending"
                  ? "待審核"
                  : application.status === "accepted"
                    ? "已接受"
                    : "已拒絕"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {application.note}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Metric label="評價" value="4.8" />
              <Metric label="完成" value="8 次" />
              <Metric label="取消" value="1 次" />
            </div>
            <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-sm leading-6">
              <p>
                <span className="font-bold text-slate-700">上車需求：</span>
                {application.pickupArea}
              </p>
              <p>
                <span className="font-bold text-slate-700">攜帶板型：</span>
                {boardLabel[application.board]}
              </p>
              <p className="text-slate-500">Line ID：接受後顯示給雙方確認聯絡</p>
            </div>
            {application.status === "pending" && myTrip?.status !== "completed" && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="rounded-xl bg-teal-600 py-3 text-sm font-bold text-white"
                  onClick={() => onReveal(application.id)}
                >
                  接受並揭露集合點
                </button>
                <button
                  className="rounded-xl border border-slate-200 py-3 text-sm font-bold"
                  onClick={() => onDecide(application.id, "rejected")}
                >
                  拒絕
                </button>
              </div>
            )}
            {application.status === "accepted" && myTrip?.status !== "completed" && (
              <div className="mt-4 space-y-2 rounded-xl bg-teal-50 p-3 text-sm leading-6">
                <p className="font-bold text-teal-800">已接受並傳送集合資訊</p>
                <p>
                  <span className="font-bold text-teal-700">集合點：</span>
                  <span className="text-teal-900">
                    {myTrip?.exactPickup || "（未填寫）"}
                  </span>
                </p>
                <p>
                  <span className="font-bold text-teal-700">Line ID：</span>
                  <span className="text-teal-900">
                    {myTrip?.lineId || "（未填寫）"}
                  </span>
                </p>
              </div>
            )}
            {application.status === "accepted" && myTrip?.status === "completed" && (
              <div className="mt-4">
                {ratedPassengerAppIds.has(application.id) ? (
                  <div className="rounded-xl bg-slate-50 p-3 text-center text-sm font-semibold text-slate-500">
                    已評價 · 感謝你的回饋
                  </div>
                ) : (
                  <button
                    className="w-full rounded-xl bg-amber-400 py-3 text-sm font-bold text-white"
                    onClick={() =>
                      onRatePassenger(application.id, application.passenger, application.passengerId)
                    }
                  >
                    為 {application.passenger} 留下評價
                  </button>
                )}
              </div>
            )}
            {application.status === "rejected" && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                已拒絕。正式版本可選填拒絕原因。
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">評價展示</h2>
        <div className="mt-3 space-y-3">
          <Review name="Mina" rating="5.0" text="準時、溝通清楚，車上規則也很明確。" />
          <Review name="阿凱" rating="4.0" text="好相處，板子都有先擦乾淨。" />
        </div>
      </section>
    </div>
  );
}

function Notifications({
  notifications,
  onMarkRead,
}: {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
}) {
  const unread = notifications.filter((n) => !n.read);
  const read = notifications.filter((n) => n.read);

  return (
    <div className="space-y-3 overflow-y-auto px-5 py-4 pb-28" style={{ maxHeight: "calc(100vh - 140px)" }}>
      <h2 className="text-xl font-bold">通知</h2>
      {notifications.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          目前沒有通知。
        </div>
      )}
      {unread.length > 0 && (
        <div className="space-y-2">
          {unread.map((n) => (
            <button
              key={n.id}
              className={`w-full rounded-2xl border p-4 text-left shadow-sm ${
                n.type === "alert"
                  ? "border-red-200 bg-red-50"
                  : n.type === "action"
                    ? "border-teal-200 bg-teal-50"
                    : "border-slate-200 bg-white"
              }`}
              onClick={() => onMarkRead(n.id)}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                    n.type === "alert"
                      ? "bg-red-100 text-red-700"
                      : n.type === "action"
                        ? "bg-teal-100 text-teal-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  新
                </span>
                <p className="text-sm font-semibold text-slate-800">{n.text}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {read.length > 0 && (
        <div className="space-y-2">
          {unread.length > 0 && (
            <p className="text-xs font-semibold text-slate-400">已讀</p>
          )}
          {read.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-400 shadow-sm"
            >
              {n.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Profile({
  tripReviews,
  profile,
  onSignOut,
}: {
  tripReviews: TripReview[];
  profile: UserProfile | null;
  onSignOut: () => void;
}) {
  const starLabel = (r: number) =>
    ["", "很差", "尚可", "普通", "不錯", "非常好！"][r] ?? "";
  const initial = (profile?.displayName ?? "?")[0].toUpperCase();

  return (
    <div className="space-y-4 overflow-y-auto px-5 py-4 pb-28" style={{ maxHeight: "calc(100vh - 140px)" }}>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-teal-100 text-2xl font-bold text-teal-800">
            {initial}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{profile?.displayName ?? "..."}</h2>
            <p className="text-sm text-slate-500">Google 帳號登入</p>
          </div>
          <button
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500"
            onClick={onSignOut}
          >
            登出
          </button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Metric label="星等" value={profile ? `${profile.rating}` : "-"} />
          <Metric label="完成" value={profile ? `${profile.completedTrips} 次` : "-"} />
          <Metric label="取消" value={profile ? `${profile.cancellations90d} 次` : "-"} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">公開評論</h2>
        <p className="mt-2 text-sm text-slate-400">收到的評價會在這裡顯示。</p>
      </section>

      {tripReviews.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">我留的評價</h2>
          <div className="mt-3 space-y-3">
            {tripReviews.map((r) => (
              <article key={r.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{r.targetName}</p>
                  <p className="text-sm font-bold text-amber-500">
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {r.tripDate} · {r.tripDestination} · {starLabel(r.rating)}
                </p>
                {r.text && (
                  <p className="mt-2 text-sm leading-6 text-slate-600">{r.text}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        第二版會加入封鎖、檢舉、手機驗證與真正的帳號資料。
      </section>
    </div>
  );
}

function Review({
  name,
  rating,
  text,
}: {
  name: string;
  rating: string;
  text: string;
}) {
  return (
    <article className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <p className="font-bold">{name}</p>
        <p className="text-sm font-bold text-teal-700">{rating}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </article>
  );
}

function TripDetail({
  trip,
  onClose,
  onApply,
}: {
  trip: Trip;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 bg-slate-950/40">
      <div className="absolute bottom-0 left-1/2 max-h-[88vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">{trip.date}</p>
            <h2 className="mt-1 text-2xl font-bold">
              {trip.departureArea} → {trip.destination}
            </h2>
          </div>
          <button className="rounded-full bg-slate-100 px-3 py-1 font-bold" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <Info label="司機" value={`${trip.driver} · ${trip.rating} 星 · 完成 ${trip.completedTrips} 次`} />
          <Info label="取消紀錄" value={`近 90 天取消 ${trip.cancellations90d} 次`} />
          <Info label="去程" value={trip.departureTime} />
          <Info label="回程" value={trip.returnTime} />
          <Info label="路線" value={`${trip.pickupMode} · ${trip.route}`} />
          <Info label="精確集合點" value="接受申請後才會顯示" />
          <Info label="板子容量" value={`短板 ${trip.shortboards} · 長板 ${trip.longboards} · ${trip.boardLocation}`} />
          <Info label="費用" value={`每人 $${trip.price}`} />
        </div>

        <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50 p-4">
          <h3 className="font-bold text-teal-900">接受後可見資訊</h3>
          <div className="mt-3 space-y-2 text-sm leading-6 text-teal-900">
            <p>精確集合點：{trip.exactPickup ? "司機已填寫，接受後開放" : "司機接受後提供"}</p>
            <p>聯絡方式：接受後顯示 Line ID，方便後續確認板子和集合時間。</p>
            <p>車牌末幾碼：正式版本會在司機接受後顯示。</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Metric label="乘客上限" value={`${trip.maxPassengers} 位`} />
          <Metric label="短板容量" value={`${trip.shortboards} 張`} />
          <Metric label="長板容量" value={`${trip.longboards} 張`} />
        </div>

        <div className="mt-4">
          <h3 className="font-bold">司機規則</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {trip.rules.map((rule) => (
              <Tag key={rule}>{rule}</Tag>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <h3 className="font-bold">行程備註</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{trip.note}</p>
        </div>

        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          申請前請確認板型、上車地區、車內規則與費用。司機接受後再交換精確集合點與 Line ID。
        </div>

        <button
          className="mt-5 w-full rounded-2xl bg-teal-600 py-4 font-bold text-white"
          onClick={onApply}
        >
          送出申請
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-xl bg-slate-50 p-3">
      <span className="shrink-0 font-bold text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function ApplySheet({
  trip,
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  trip: Trip;
  form: {
    pickupArea: string;
    flexiblePickup: boolean;
    board: BoardType;
    lineId: string;
    note: string;
  };
  setForm: (form: {
    pickupArea: string;
    flexiblePickup: boolean;
    board: BoardType;
    lineId: string;
    note: string;
  }) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/50">
      <div className="absolute bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">申請加入</p>
            <h2 className="text-xl font-bold">{trip.destination}</h2>
          </div>
          <button className="rounded-full bg-slate-100 px-3 py-1 font-bold" onClick={onClose}>
            關閉
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="上車地區">
            <input
              className="input w-full"
              placeholder="例如永和、新店、可到捷運站"
              value={form.pickupArea}
              onChange={(event) =>
                setForm({ ...form, pickupArea: event.target.value })
              }
            />
          </Field>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.flexiblePickup}
              onChange={(event) =>
                setForm({ ...form, flexiblePickup: event.target.checked })
              }
            />
            可配合司機上車點
          </label>
          <Field label="攜帶板型">
            <select
              className="input w-full"
              value={form.board}
              onChange={(event) =>
                setForm({ ...form, board: event.target.value as BoardType })
              }
            >
              <option value="none">無板</option>
              <option value="short">短板</option>
              <option value="long">長板</option>
            </select>
          </Field>
          {form.board === "long" && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
              長板通常需要車頂架或較大車內空間，送出前請在備註寫板袋與尺寸狀況。
            </div>
          )}
          <Field label="Line ID">
            <input
              className="input w-full"
              placeholder="接受後用來聯絡司機"
              value={form.lineId}
              onChange={(event) =>
                setForm({ ...form, lineId: event.target.value })
              }
            />
          </Field>
          <Field label="申請備註">
            <textarea
              className="input min-h-24 w-full resize-none"
              placeholder="例如我有板袋、可配合路線、會先把板子沖乾淨"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </Field>
          <div className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
            送出後司機會看到你的評價、完成次數、近 90 天取消次數與申請備註。
          </div>
        </div>
        <button
          className="mt-5 w-full rounded-2xl bg-teal-600 py-4 font-bold text-white"
          onClick={onSubmit}
        >
          送出申請
        </button>
      </div>
    </div>
  );
}

function CreatePassengerRequestSheet({
  request,
  setRequest,
  onClose,
  onPublish,
}: {
  request: {
    date: string;
    destination: string;
    departureArea: string;
    routeFlexibility: string;
    tripType: string;
    outboundTime: string;
    returnTime: string;
    board: BoardType;
    acceptablePrice: number;
    lineId: string;
    note: string;
  };
  setRequest: (request: {
    date: string;
    destination: string;
    departureArea: string;
    routeFlexibility: string;
    tripType: string;
    outboundTime: string;
    returnTime: string;
    board: BoardType;
    acceptablePrice: number;
    lineId: string;
    note: string;
  }) => void;
  onClose: () => void;
  onPublish: () => void;
}) {
  const showOutbound = request.tripType !== "只回程";
  const showReturn = request.tripType !== "只去程";

  function updateTripType(tripType: string) {
    setRequest({
      ...request,
      tripType,
      outboundTime:
        tripType === "只回程" ? "" : request.outboundTime || "06:00-06:30",
      returnTime:
        tripType === "只去程" ? "" : request.returnTime || "現場討論",
    });
  }

  return (
    <div className="fixed inset-0 z-30 bg-slate-950/40">
      <div className="absolute bottom-0 left-1/2 max-h-[92vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">乘客徵司機</p>
            <h2 className="text-2xl font-bold">發布找車需求</h2>
          </div>
          <button
            className="rounded-full bg-slate-100 px-3 py-1 font-bold"
            onClick={onClose}
          >
            關閉
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <Field label="日期">
            <input
              className="input w-full"
              type="date"
              value={request.date}
              onChange={(event) =>
                setRequest({ ...request, date: event.target.value })
              }
            />
          </Field>
          <Field label="想去的衝浪點">
            <select
              className="input w-full"
              value={request.destination}
              onChange={(event) =>
                setRequest({ ...request, destination: event.target.value })
              }
            >
              {surfSpots.map((spot) => (
                <option key={spot}>{spot}</option>
              ))}
            </select>
          </Field>
          <Field label="出發地區">
            <input
              className="input w-full"
              placeholder="例如永和、新店、台北車站"
              value={request.departureArea}
              onChange={(event) =>
                setRequest({ ...request, departureArea: event.target.value })
              }
            />
          </Field>
          <Field label="可配合路線或上車點">
            <textarea
              className="input min-h-20 w-full resize-none"
              placeholder="例如可到頂溪、景安或新店上車"
              value={request.routeFlexibility}
              onChange={(event) =>
                setRequest({ ...request, routeFlexibility: event.target.value })
              }
            />
          </Field>
          <Field label="行程類型">
            <select
              className="input w-full"
              value={request.tripType}
              onChange={(event) => updateTripType(event.target.value)}
            >
              <option>去回程</option>
              <option>只去程</option>
              <option>只回程</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {showOutbound && (
              <Field label="希望去程時間">
                <input
                  className="input w-full"
                  placeholder="06:00-06:30"
                  value={request.outboundTime}
                  onChange={(event) =>
                    setRequest({ ...request, outboundTime: event.target.value })
                  }
                />
              </Field>
            )}
            {showReturn && (
              <Field label="希望回程時間">
                <input
                  className="input w-full"
                  placeholder="現場討論"
                  value={request.returnTime}
                  onChange={(event) =>
                    setRequest({ ...request, returnTime: event.target.value })
                  }
                />
              </Field>
            )}
          </div>
          <Field label="板型">
            <select
              className="input w-full"
              value={request.board}
              onChange={(event) =>
                setRequest({ ...request, board: event.target.value as BoardType })
              }
            >
              <option value="none">無板</option>
              <option value="short">短板</option>
              <option value="long">長板</option>
            </select>
          </Field>
          <Field label="可接受價格">
            <input
              className="input w-full"
              inputMode="numeric"
              value={request.acceptablePrice}
              onChange={(event) =>
                setRequest({
                  ...request,
                  acceptablePrice: Number(event.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="Line ID">
            <input
              className="input w-full"
              value={request.lineId}
              onChange={(event) =>
                setRequest({ ...request, lineId: event.target.value })
              }
            />
          </Field>
          <Field label="備註">
            <textarea
              className="input min-h-24 w-full resize-none"
              placeholder="例如有板袋、希望車頂架、可配合早餐"
              value={request.note}
              onChange={(event) =>
                setRequest({ ...request, note: event.target.value })
              }
            />
          </Field>
        </div>

        <button
          className="mt-5 w-full rounded-2xl bg-teal-600 py-4 font-bold text-white"
          onClick={onPublish}
        >
          發布需求
        </button>
      </div>
    </div>
  );
}

function CreateTripSheet({
  step,
  setStep,
  trip,
  setTrip,
  onClose,
  onPublish,
}: {
  step: number;
  setStep: (step: number) => void;
  trip: TripForm;
  setTrip: (trip: TripForm) => void;
  onClose: () => void;
  onPublish: () => void;
}) {
  const ruleOptions = ["禁菸", "不吃檳榔", "可喝飲料", "不可吃東西", "乘客需自備板袋"];
  const showOutbound = trip.tripType !== "只回程";
  const showReturn = trip.tripType !== "只去程";

  function updateTripType(tripType: string) {
    setTrip({
      ...trip,
      tripType,
      departureTime: tripType === "只回程" ? "" : trip.departureTime || "06:00",
      returnMode: tripType === "只去程" ? "" : trip.returnMode || "現場討論",
      returnTime: tripType === "只去程" ? "" : trip.returnTime || "14:00",
    });
  }

  return (
    <div className="fixed inset-0 z-30 bg-slate-950/40">
      <div className="absolute bottom-0 left-1/2 max-h-[92vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">步驟 {step} / 4</p>
            <h2 className="text-2xl font-bold">發起共乘</h2>
          </div>
          <button className="rounded-full bg-slate-100 px-3 py-1 font-bold" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {step === 1 && (
            <>
              <Field label="日期">
                <input
                  className="input w-full"
                  type="date"
                  value={trip.date}
                  onChange={(event) =>
                    setTrip({ ...trip, date: event.target.value })
                  }
                />
              </Field>
              <Field label="目的衝浪點">
                <select
                  className="input w-full"
                  value={trip.destination}
                  onChange={(event) =>
                    setTrip({ ...trip, destination: event.target.value })
                  }
                >
                  {surfSpots.map((spot) => (
                    <option key={spot}>{spot}</option>
                  ))}
                </select>
              </Field>
              <Field label="行程類型">
                <select
                  className="input w-full"
                  value={trip.tripType}
                  onChange={(event) => updateTripType(event.target.value)}
                >
                  <option>去回程</option>
                  <option>只去程</option>
                  <option>只回程</option>
                </select>
              </Field>
              {showOutbound && (
                <section className="rounded-2xl bg-slate-50 p-3">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">去程時間</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="時間形式">
                      <select
                        className="input w-full"
                        value={trip.departureMode}
                        onChange={(event) =>
                          setTrip({ ...trip, departureMode: event.target.value })
                        }
                      >
                        <option>準時出發</option>
                        <option>彈性區間</option>
                      </select>
                    </Field>
                    <Field label={trip.departureMode === "彈性區間" ? "時間區間" : "出發時間"}>
                      <input
                        className="input w-full"
                        placeholder={trip.departureMode === "彈性區間" ? "06:00-06:20" : "06:00"}
                        value={trip.departureTime}
                        onChange={(event) =>
                          setTrip({ ...trip, departureTime: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                </section>
              )}
              {showReturn && (
                <section className="rounded-2xl bg-slate-50 p-3">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">回程時間</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="時間形式">
                      <select
                        className="input w-full"
                        value={trip.returnMode || "現場討論"}
                        onChange={(event) =>
                          setTrip({ ...trip, returnMode: event.target.value })
                        }
                      >
                        <option>固定時間</option>
                        <option>約略時間</option>
                        <option>現場討論</option>
                      </select>
                    </Field>
                    {trip.returnMode !== "現場討論" && (
                      <Field label="回程時間">
                        <input
                          className="input w-full"
                          placeholder={trip.returnMode === "約略時間" ? "約略 14:00" : "14:00"}
                          value={trip.returnTime}
                          onChange={(event) =>
                            setTrip({ ...trip, returnTime: event.target.value })
                          }
                        />
                      </Field>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Field label="公開出發區域">
                <input
                  className="input w-full"
                  placeholder="例如新店、中和、台北車站"
                  value={trip.departureArea}
                  onChange={(event) =>
                    setTrip({ ...trip, departureArea: event.target.value })
                  }
                />
              </Field>
              <Field label="精確集合點">
                <input
                  className="input w-full"
                  placeholder="僅接受後可見"
                  value={trip.exactPickup}
                  onChange={(event) =>
                    setTrip({ ...trip, exactPickup: event.target.value })
                  }
                />
              </Field>
              <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={trip.pickupMode}
                  onChange={(event) =>
                    setTrip({ ...trip, pickupMode: event.target.checked })
                  }
                />
                沿路可接
              </label>
              <Field label="大概路線">
                <textarea
                  className="input min-h-24 w-full resize-none"
                  placeholder="例如新店 -> 國五 -> 烏石港"
                  value={trip.route}
                  onChange={(event) =>
                    setTrip({ ...trip, route: event.target.value })
                  }
                />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <Field label="車型選填">
                <input
                  className="input w-full"
                  placeholder="例如休旅、轎車、廂型車"
                  value={trip.vehicle}
                  onChange={(event) =>
                    setTrip({ ...trip, vehicle: event.target.value })
                  }
                />
              </Field>
              <div className="space-y-2">
                <NumberInput
                  label="乘客數量"
                  value={trip.maxPassengers}
                  onChange={(value) => setTrip({ ...trip, maxPassengers: value })}
                />
                <NumberInput
                  label="短板數量"
                  value={trip.shortboards}
                  onChange={(value) => setTrip({ ...trip, shortboards: value })}
                />
                <NumberInput
                  label="長板數量"
                  value={trip.longboards}
                  onChange={(value) => setTrip({ ...trip, longboards: value })}
                />
              </div>
              {trip.shortboards > 0 || trip.longboards > 0 ? (
                <Field label="板子放置方式">
                  <select
                    className="input w-full"
                    value={trip.boardLocation}
                    onChange={(event) =>
                      setTrip({ ...trip, boardLocation: event.target.value })
                    }
                  >
                    <option>車內</option>
                    <option>車頂架</option>
                    <option>都可</option>
                  </select>
                </Field>
              ) : (
                <div className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  目前板子數量是 0，不需要選板子放置方式。
                </div>
              )}
              <Field label="每人共乘費用">
                <input
                  className="input w-full"
                  inputMode="numeric"
                  value={trip.price}
                  onChange={(event) =>
                    setTrip({ ...trip, price: Number(event.target.value) || 0 })
                  }
                />
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <Field label="車內規則">
                <div className="flex flex-wrap gap-2">
                  {ruleOptions.map((rule) => (
                    <button
                      key={rule}
                      className={`rounded-full px-3 py-2 text-sm font-bold ${
                        trip.rules.includes(rule)
                          ? "bg-teal-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                      onClick={() =>
                        setTrip({
                          ...trip,
                          rules: trip.rules.includes(rule)
                            ? trip.rules.filter((item) => item !== rule)
                            : [...trip.rules, rule],
                        })
                      }
                    >
                      {rule}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="行程備註">
                <textarea
                  className="input min-h-28 w-full resize-none"
                  placeholder="早餐、跑點、天氣變動或其他備註"
                  value={trip.note}
                  onChange={(event) =>
                    setTrip({ ...trip, note: event.target.value })
                  }
                />
              </Field>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                <p className="font-bold">
                  {trip.departureArea} → {trip.destination}
                </p>
                <p className="mt-1 text-slate-500">
                  {trip.date} · {trip.tripType} · ${trip.price}/人
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            className="rounded-2xl border border-slate-200 py-4 font-bold disabled:text-slate-300"
            disabled={step === 1}
            onClick={() => setStep(Math.max(1, step - 1))}
          >
            上一步
          </button>
          {step < 4 ? (
            <button
              className="rounded-2xl bg-teal-600 py-4 font-bold text-white"
              onClick={() => setStep(step + 1)}
            >
              下一步
            </button>
          ) : (
            <button
              className="rounded-2xl bg-teal-600 py-4 font-bold text-white"
              onClick={onPublish}
            >
              發布
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EditTripSheet({
  form,
  setForm,
  onClose,
  onSave,
}: {
  form: TripForm;
  setForm: (form: TripForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const ruleOptions = ["禁菸", "不吃檳榔", "可喝飲料", "不可吃東西", "乘客需自備板袋"];
  const showOutbound = form.tripType !== "只回程";
  const showReturn = form.tripType !== "只去程";

  function updateTripType(tripType: string) {
    setForm({
      ...form,
      tripType,
      departureTime: tripType === "只回程" ? "" : form.departureTime || "06:00",
      returnMode: tripType === "只去程" ? "" : form.returnMode || "現場討論",
      returnTime: tripType === "只去程" ? "" : form.returnTime || "14:00",
    });
  }

  return (
    <div className="fixed inset-0 z-30 bg-slate-950/40">
      <div className="absolute bottom-0 left-1/2 max-h-[92vh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">修改行程</p>
            <h2 className="text-2xl font-bold">
              {form.departureArea} → {form.destination}
            </h2>
          </div>
          <button className="rounded-full bg-slate-100 px-3 py-1 font-bold" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <section className="space-y-3 rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-500">基本資訊</h3>
            <Field label="日期">
              <input
                className="input w-full"
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </Field>
            <Field label="目的衝浪點">
              <select
                className="input w-full"
                value={form.destination}
                onChange={(event) => setForm({ ...form, destination: event.target.value })}
              >
                {surfSpots.map((spot) => (
                  <option key={spot}>{spot}</option>
                ))}
              </select>
            </Field>
            <Field label="行程類型">
              <select
                className="input w-full"
                value={form.tripType}
                onChange={(event) => updateTripType(event.target.value)}
              >
                <option>去回程</option>
                <option>只去程</option>
                <option>只回程</option>
              </select>
            </Field>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-500">時間</h3>
            {showOutbound && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="去程時間形式">
                  <select
                    className="input w-full"
                    value={form.departureMode}
                    onChange={(event) => setForm({ ...form, departureMode: event.target.value })}
                  >
                    <option>準時出發</option>
                    <option>彈性區間</option>
                  </select>
                </Field>
                <Field label={form.departureMode === "彈性區間" ? "時間區間" : "出發時間"}>
                  <input
                    className="input w-full"
                    placeholder={form.departureMode === "彈性區間" ? "06:00-06:20" : "06:00"}
                    value={form.departureTime}
                    onChange={(event) => setForm({ ...form, departureTime: event.target.value })}
                  />
                </Field>
              </div>
            )}
            {showReturn && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="回程時間形式">
                  <select
                    className="input w-full"
                    value={form.returnMode || "現場討論"}
                    onChange={(event) => setForm({ ...form, returnMode: event.target.value })}
                  >
                    <option>固定時間</option>
                    <option>約略時間</option>
                    <option>現場討論</option>
                  </select>
                </Field>
                {form.returnMode !== "現場討論" && (
                  <Field label="回程時間">
                    <input
                      className="input w-full"
                      placeholder={form.returnMode === "約略時間" ? "14:00" : "14:00"}
                      value={form.returnTime}
                      onChange={(event) => setForm({ ...form, returnTime: event.target.value })}
                    />
                  </Field>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-500">路線與集合</h3>
            <Field label="公開出發區域">
              <input
                className="input w-full"
                placeholder="例如新店、中和、台北車站"
                value={form.departureArea}
                onChange={(event) => setForm({ ...form, departureArea: event.target.value })}
              />
            </Field>
            <Field label="精確集合點">
              <input
                className="input w-full"
                placeholder="僅接受後可見"
                value={form.exactPickup}
                onChange={(event) => setForm({ ...form, exactPickup: event.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.pickupMode}
                onChange={(event) => setForm({ ...form, pickupMode: event.target.checked })}
              />
              沿路可接
            </label>
            <Field label="大概路線">
              <textarea
                className="input min-h-20 w-full resize-none"
                placeholder="例如新店 -> 國五 -> 烏石港"
                value={form.route}
                onChange={(event) => setForm({ ...form, route: event.target.value })}
              />
            </Field>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-500">空間與費用</h3>
            <div className="space-y-2">
              <NumberInput
                label="乘客數量"
                value={form.maxPassengers}
                onChange={(value) => setForm({ ...form, maxPassengers: value })}
              />
              <NumberInput
                label="短板數量"
                value={form.shortboards}
                onChange={(value) => setForm({ ...form, shortboards: value })}
              />
              <NumberInput
                label="長板數量"
                value={form.longboards}
                onChange={(value) => setForm({ ...form, longboards: value })}
              />
            </div>
            {form.shortboards > 0 || form.longboards > 0 ? (
              <Field label="板子放置方式">
                <select
                  className="input w-full"
                  value={form.boardLocation}
                  onChange={(event) => setForm({ ...form, boardLocation: event.target.value })}
                >
                  <option>車內</option>
                  <option>車頂架</option>
                  <option>都可</option>
                </select>
              </Field>
            ) : (
              <div className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                目前板子數量是 0，不需要選板子放置方式。
              </div>
            )}
            <Field label="每人共乘費用">
              <input
                className="input w-full"
                inputMode="numeric"
                value={form.price}
                onChange={(event) =>
                  setForm({ ...form, price: Number(event.target.value) || 0 })
                }
              />
            </Field>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-bold text-slate-500">規則與備註</h3>
            <Field label="車內規則">
              <div className="flex flex-wrap gap-2">
                {ruleOptions.map((rule) => (
                  <button
                    key={rule}
                    className={`rounded-full px-3 py-2 text-sm font-bold ${
                      form.rules.includes(rule)
                        ? "bg-teal-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                    onClick={() =>
                      setForm({
                        ...form,
                        rules: form.rules.includes(rule)
                          ? form.rules.filter((item) => item !== rule)
                          : [...form.rules, rule],
                      })
                    }
                  >
                    {rule}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="行程備註">
              <textarea
                className="input min-h-28 w-full resize-none"
                placeholder="早餐、跑點、天氣變動或其他備註"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
              />
            </Field>
          </section>

          <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            儲存後所有已申請的乘客都會收到「行程已更新」通知，請確認修改內容再送出。
          </div>
        </div>

        <button
          className="mt-5 w-full rounded-2xl bg-teal-600 py-4 font-bold text-white"
          onClick={onSave}
        >
          儲存修改
        </button>
      </div>
    </div>
  );
}

function ConfirmSheet({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60">
      <div className="absolute bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-3xl bg-white p-5 shadow-2xl">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            className="rounded-2xl border border-slate-200 py-4 font-bold"
            onClick={onClose}
          >
            再想想
          </button>
          <button
            className="rounded-2xl bg-red-600 py-4 font-bold text-white"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RevealSheet({
  passengerName,
  pickupArea,
  board,
  form,
  setForm,
  onClose,
  onConfirm,
}: {
  passengerName: string;
  pickupArea: string;
  board: BoardType;
  form: { exactPickup: string; lineId: string };
  setForm: (form: { exactPickup: string; lineId: string }) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/50">
      <div className="absolute bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">接受申請</p>
            <h2 className="text-xl font-bold">傳送集合資訊給 {passengerName}</h2>
          </div>
          <button className="rounded-full bg-slate-100 px-3 py-1 font-bold" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          <p>
            <span className="font-bold text-slate-700">上車地點：</span>
            {pickupArea}
          </p>
          <p>
            <span className="font-bold text-slate-700">攜帶板型：</span>
            {boardLabel[board]}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="精確集合點（僅對方可見）">
            <textarea
              className="input min-h-20 w-full resize-none"
              placeholder="例如新店捷運 2 號出口、台北車站東三門 7-11 旁"
              value={form.exactPickup}
              onChange={(event) =>
                setForm({ ...form, exactPickup: event.target.value })
              }
            />
          </Field>
          <Field label="你的 Line ID（僅對方可見）">
            <input
              className="input w-full"
              placeholder="例如 surf-kai"
              value={form.lineId}
              onChange={(event) =>
                setForm({ ...form, lineId: event.target.value })
              }
            />
          </Field>
          <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-800">
            確認後 {passengerName} 才能看到集合點與 Line ID。之後修改行程時可以更新這些資訊。
          </div>
        </div>

        <button
          className="mt-5 w-full rounded-2xl bg-teal-600 py-4 font-bold text-white"
          onClick={onConfirm}
        >
          確認接受並傳送
        </button>
      </div>
    </div>
  );
}

function RatingSheet({
  targetName,
  tripDate,
  tripDestination,
  onClose,
  onSubmit,
}: {
  targetName: string;
  tripDate: string;
  tripDestination: string;
  onClose: () => void;
  onSubmit: (rating: number, text: string) => void;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const ratingLabels = ["", "很差", "尚可", "普通", "不錯", "非常好！"];

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/50">
      <div className="absolute bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">留下評價</p>
            <h2 className="text-xl font-bold">{targetName}</h2>
          </div>
          <button className="rounded-full bg-slate-100 px-3 py-1 font-bold" onClick={onClose}>
            關閉
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {tripDate} · {tripDestination}
        </p>

        <div className="mt-5">
          <p className="mb-2 text-xs font-bold text-slate-500">評分</p>
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`text-4xl transition-transform active:scale-90 ${
                  star <= rating ? "text-amber-400" : "text-slate-200"
                }`}
                onClick={() => setRating(star)}
              >
                ★
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {ratingLabels[rating]}
            </p>
          )}
        </div>

        <div className="mt-4">
          <Field label="評語（選填）">
            <textarea
              className="input min-h-24 w-full resize-none"
              placeholder="例如準時、溝通清楚、板子有先沖乾淨"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-500">
          評價送出後會公開在對方的個人頁面，無法修改。
        </div>

        <button
          className="mt-5 w-full rounded-2xl bg-teal-600 py-4 font-bold text-white disabled:bg-slate-300"
          disabled={rating === 0}
          onClick={() => onSubmit(rating, text)}
        >
          送出評價
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#edf3f7] px-6">
      <div className="w-full max-w-xs rounded-3xl bg-white p-8 shadow-xl shadow-slate-200">
        <p className="text-center text-xs font-semibold text-teal-700">台灣衝浪共乘</p>
        <h1 className="mt-1 text-center text-3xl font-bold">浪乘</h1>
        <p className="mt-4 text-center text-sm leading-6 text-slate-500">
          登入後可以發起共乘、申請行程、留下評價。
        </p>
        <button
          className="mt-6 w-full rounded-2xl bg-slate-950 py-4 font-bold text-white"
          onClick={onSignIn}
        >
          Google 登入
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">
          登入即表示同意使用條款與隱私政策
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-xl font-bold text-slate-700 shadow-sm disabled:text-slate-300"
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          -
        </button>
        <input
          className="w-10 bg-transparent text-center text-lg font-bold outline-none"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
        />
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-xl font-bold text-slate-700 shadow-sm"
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export type Tab = "find" | "trips" | "notifications" | "profile";
export type FindMode = "trips" | "requests";
export type TripStatus = "open" | "full" | "departed" | "completed" | "cancelled";
export type BoardType = "none" | "short" | "long";
export type ApplicationStatus = "pending" | "accepted" | "rejected" | "cancelled";
export type RequestStatus = "searching" | "matched" | "cancelled" | "expired";

export type UserProfile = {
  id: string;
  displayName: string;
  rating: number;
  completedTrips: number;
  cancellations90d: number;
  lineId?: string;
};

export type Trip = {
  id: string;
  driverId: string;
  driver: string;
  rating: number;
  completedTrips: number;
  cancellations90d: number;
  date: string;
  destination: string;
  departureArea: string;
  departureTime: string;
  returnTime: string;
  tripType: string;
  route: string;
  pickupMode: string;
  seatsLeft: number;
  maxPassengers: number;
  shortboards: number;
  longboards: number;
  boardLocation: string;
  price: number;
  status: TripStatus;
  rules: string[];
  note: string;
  exactPickup?: string;
  lineId?: string;
};

export type Application = {
  id: string;
  tripId: string;
  passengerId: string;
  passenger: string;
  pickupArea: string;
  board: BoardType;
  lineId: string;
  note: string;
  status: ApplicationStatus;
};

export type PassengerRequest = {
  id: string;
  passengerId: string;
  passenger: string;
  rating: number;
  completedTrips: number;
  cancellations90d: number;
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
  status: RequestStatus;
};

export type Notification = {
  id: string;
  userId: string;
  text: string;
  type: "info" | "action" | "alert";
  read: boolean;
};

export type TripReview = {
  id: string;
  reviewerId: string;
  targetId: string;
  targetName: string;
  tripDate: string;
  tripDestination: string;
  rating: number;
  text: string;
};

export type TripForm = {
  date: string;
  destination: string;
  departureArea: string;
  exactPickup: string;
  route: string;
  pickupMode: boolean;
  tripType: string;
  departureMode: string;
  departureTime: string;
  returnMode: string;
  returnTime: string;
  maxPassengers: number;
  shortboards: number;
  longboards: number;
  boardLocation: string;
  vehicle: string;
  price: number;
  rules: string[];
  note: string;
};

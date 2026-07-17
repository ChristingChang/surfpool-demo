-- supabase/schema.sql

-- ==========================================
-- 1. 建立 Enum 型別
-- ==========================================
CREATE TYPE trip_status AS ENUM ('open', 'full', 'departed', 'completed', 'cancelled');
CREATE TYPE board_type AS ENUM ('none', 'short', 'long');
CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
CREATE TYPE request_status AS ENUM ('searching', 'matched', 'cancelled', 'expired');
CREATE TYPE notification_type AS ENUM ('info', 'action', 'alert');

-- ==========================================
-- 2. 建立資料表 (Tables)
-- ==========================================

-- User Profiles (對應 UserProfile 型別，且與 auth.users 連動)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  rating NUMERIC DEFAULT 0,
  completed_trips INTEGER DEFAULT 0,
  cancellations_90d INTEGER DEFAULT 0,
  line_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trips (開團資訊)
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  driver TEXT NOT NULL, -- 備份名稱，或建議前端 JOIN profiles 表取得
  rating NUMERIC DEFAULT 0,
  completed_trips INTEGER DEFAULT 0,
  cancellations_90d INTEGER DEFAULT 0,
  date DATE NOT NULL,
  destination TEXT NOT NULL,
  departure_area TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  return_time TEXT NOT NULL,
  trip_type TEXT NOT NULL,
  route TEXT NOT NULL,
  pickup_mode TEXT NOT NULL,
  seats_left INTEGER NOT NULL,
  max_passengers INTEGER NOT NULL,
  shortboards INTEGER NOT NULL,
  longboards INTEGER NOT NULL,
  board_location TEXT NOT NULL,
  price INTEGER NOT NULL,
  status trip_status DEFAULT 'open',
  rules TEXT[] DEFAULT '{}',
  note TEXT,
  exact_pickup TEXT,
  line_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Applications (共乘申請)
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  passenger TEXT NOT NULL,
  pickup_area TEXT NOT NULL,
  board board_type DEFAULT 'none',
  line_id TEXT NOT NULL,
  note TEXT,
  status application_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Passenger Requests (乘客尋車需求)
CREATE TABLE public.passenger_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  passenger TEXT NOT NULL,
  rating NUMERIC DEFAULT 0,
  completed_trips INTEGER DEFAULT 0,
  cancellations_90d INTEGER DEFAULT 0,
  date DATE NOT NULL,
  destination TEXT NOT NULL,
  departure_area TEXT NOT NULL,
  route_flexibility TEXT NOT NULL,
  trip_type TEXT NOT NULL,
  outbound_time TEXT NOT NULL,
  return_time TEXT NOT NULL,
  board board_type DEFAULT 'none',
  acceptable_price INTEGER NOT NULL,
  line_id TEXT NOT NULL,
  note TEXT,
  status request_status DEFAULT 'searching',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications (通知)
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type notification_type DEFAULT 'info',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trip Reviews (評價)
CREATE TABLE public.trip_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_name TEXT NOT NULL,
  trip_date DATE NOT NULL,
  trip_destination TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 3. 設定 Row Level Security (RLS) 原則
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passenger_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_reviews ENABLE ROW LEVEL SECURITY;

-- 讓所有人可以讀取 (Read)
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public trips are viewable by everyone." ON public.trips FOR SELECT USING (true);
CREATE POLICY "Public passenger_requests viewable by everyone" ON public.passenger_requests FOR SELECT USING (true);
CREATE POLICY "Public reviews viewable by everyone" ON public.trip_reviews FOR SELECT USING (true);

-- 讓使用者可以寫入 (Insert / Update / Delete) 他們自己的資料
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can create trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Users can update own trips" ON public.trips FOR UPDATE USING (auth.uid() = driver_id);
CREATE POLICY "Users can delete own trips" ON public.trips FOR DELETE USING (auth.uid() = driver_id);

CREATE POLICY "Users can apply for trips" ON public.applications FOR INSERT WITH CHECK (auth.uid() = passenger_id);
CREATE POLICY "Users can view own applications or received applications" ON public.applications FOR SELECT USING (auth.uid() = passenger_id OR auth.uid() IN (SELECT driver_id FROM public.trips WHERE id = trip_id));
CREATE POLICY "Users can update own applications" ON public.applications FOR UPDATE USING (auth.uid() = passenger_id OR auth.uid() IN (SELECT driver_id FROM public.trips WHERE id = trip_id));

CREATE POLICY "Users can create passenger requests" ON public.passenger_requests FOR INSERT WITH CHECK (auth.uid() = passenger_id);
CREATE POLICY "Users can update own passenger requests" ON public.passenger_requests FOR UPDATE USING (auth.uid() = passenger_id);
CREATE POLICY "Users can delete own passenger requests" ON public.passenger_requests FOR DELETE USING (auth.uid() = passenger_id);

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can create reviews" ON public.trip_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

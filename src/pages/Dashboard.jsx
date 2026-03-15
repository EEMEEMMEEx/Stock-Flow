import React, { useEffect, useState, Component } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area,
    LineChart,
    Line
} from 'recharts';
import { Package, AlertTriangle, TrendingUp, Activity, ArrowUpRight, CheckCircle, LayoutDashboard, RefreshCw, Loader2, XCircle, Calendar, Clock, BarChart3 } from 'lucide-react';
import { format, subDays, startOfDay, parseISO, subMonths, getDay, getHours } from 'date-fns';
import { th } from 'date-fns/locale';

// Error Boundary Component
class DashboardErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error('Dashboard Error:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        if (this.props.onRetry) {
            this.props.onRetry();
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[400px] flex items-center justify-center">
                    <div className="glass-card p-8 max-w-md text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                            <XCircle className="text-red-400" size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">เกิดข้อผิดพลาด</h2>
                        <p className="text-gray-400 mb-4">
                            ไม่สามารถโหลดแดชบอร์ดได้ กรุณาลองใหม่อีกครั้ง
                        </p>
                        <button
                            onClick={this.handleRetry}
                            className="px-6 py-3 bg-gradient-to-r from-[#1C6CB4] to-[#2d8dd4] text-white rounded-xl font-medium hover:shadow-lg hover:shadow-[#1C6CB4]/30 transition-all duration-300 flex items-center gap-2 mx-auto"
                        >
                            <RefreshCw size={18} />
                            ลองใหม่
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// Loading Skeleton Component
const LoadingSkeleton = () => (
    <div className="space-y-6 animate-pulse">
        <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gray-200 rounded-xl"></div>
            <div className="h-8 w-32 bg-gray-200 rounded-lg"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
                <div key={i} className="glass-card p-6 flex items-center gap-4">
                    <div className="w-16 h-16 bg-gray-200 rounded-2xl"></div>
                    <div className="flex-1">
                        <div className="h-4 w-20 bg-gray-200 rounded mb-2"></div>
                        <div className="h-8 w-16 bg-gray-200 rounded"></div>
                    </div>
                </div>
            ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-card p-6">
                <div className="h-6 w-48 bg-gray-200 rounded mb-6"></div>
                <div className="h-[300px] bg-gray-100 rounded-xl flex items-center justify-center">
                    <Loader2 className="text-gray-400 animate-spin" size={40} />
                </div>
            </div>
            <div className="glass-card p-6">
                <div className="h-6 w-32 bg-gray-200 rounded mb-6"></div>
                <div className="h-[220px] bg-gray-100 rounded-xl"></div>
            </div>
        </div>
    </div>
);

// Error Display Component
const ErrorDisplay = ({ error, onRetry }) => (
    <div className="min-h-[400px] flex items-center justify-center">
        <div className="glass-card p-8 max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>ไม่สามารถโหลดข้อมูลได้</h2>
            <p className="text-gray-500 mb-4">
                {error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง'}
            </p>
            <button
                onClick={onRetry}
                className="px-6 py-3 bg-gradient-to-r from-[#1C6CB4] to-[#2d8dd4] text-white rounded-xl font-medium hover:shadow-lg hover:shadow-[#1C6CB4]/30 transition-all duration-300 flex items-center gap-2 mx-auto"
            >
                <RefreshCw size={18} />
                ลองใหม่
            </button>
        </div>
    </div>
);

// Heatmap Component
const CheckoutHeatmap = ({ data }) => {
    const days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    const hours = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];

    const getColor = (value, maxValue) => {
        if (value === 0) return 'bg-gray-100';
        const intensity = value / maxValue;
        if (intensity > 0.75) return 'bg-[#1C6CB4]';
        if (intensity > 0.5) return 'bg-[#1C6CB4]/70';
        if (intensity > 0.25) return 'bg-[#1C6CB4]/40';
        return 'bg-[#1C6CB4]/20';
    };

    const maxValue = Math.max(...data.flat(), 1);

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[400px]">
                {/* Header - Hours */}
                <div className="flex gap-1 mb-1 ml-8">
                    {hours.map(hour => (
                        <div key={hour} className="w-8 text-center text-xs text-gray-500">
                            {hour}
                        </div>
                    ))}
                </div>

                {/* Grid */}
                {days.map((day, dayIndex) => (
                    <div key={day} className="flex items-center gap-1 mb-1">
                        <div className="w-7 text-xs text-gray-500 text-right pr-1">{day}</div>
                        {hours.map((hour, hourIndex) => {
                            const value = data[dayIndex]?.[hourIndex] || 0;
                            return (
                                <div
                                    key={`${day}-${hour}`}
                                    className={`w-8 h-6 rounded ${getColor(value, maxValue)} transition-colors cursor-default`}
                                    title={`${day} ${hour}:00 - ${value} รายการ`}
                                />
                            );
                        })}
                    </div>
                ))}

                {/* Legend */}
                <div className="flex items-center justify-end gap-2 mt-3 text-xs text-gray-500">
                    <span>น้อย</span>
                    <div className="flex gap-1">
                        <div className="w-4 h-4 rounded bg-gray-100"></div>
                        <div className="w-4 h-4 rounded bg-[#1C6CB4]/20"></div>
                        <div className="w-4 h-4 rounded bg-[#1C6CB4]/40"></div>
                        <div className="w-4 h-4 rounded bg-[#1C6CB4]/70"></div>
                        <div className="w-4 h-4 rounded bg-[#1C6CB4]"></div>
                    </div>
                    <span>มาก</span>
                </div>
            </div>
        </div>
    );
};

const DashboardContent = () => {
    const [stats, setStats] = useState({
        totalProducts: 0,
        lowStock: 0,
        totalValue: 0,
        totalItems: 0,
    });
    const [categoryData, setCategoryData] = useState([]);
    const [topMovers, setTopMovers] = useState([]);
    const [trendData, setTrendData] = useState([]);
    const [lowStockItems, setLowStockItems] = useState([]);
    const [assetStatus, setAssetStatus] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // New analytics state
    const [top10Products, setTop10Products] = useState([]);
    const [monthlyData, setMonthlyData] = useState([]);
    const [heatmapData, setHeatmapData] = useState(Array(7).fill().map(() => Array(10).fill(0)));

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            setError(null);

            // 1. Fetch Products for Stats, Category Dist, and Low Stock
            const productsSnapshot = await getDocs(collection(db, 'products'));
            const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Calculate Stats
            const totalProducts = products.length;
            const lowStockList = products.filter(p => {
                const qty = parseInt(p.quantity) || 0;
                const min = parseInt(p.min_threshold) || 0;
                return qty <= min;
            });
            const lowStock = lowStockList.length;
            const totalItems = products.reduce((acc, curr) => acc + (parseInt(curr.quantity) || 0), 0);

            setLowStockItems(lowStockList);

            // Calculate Category Distribution
            const categoryMap = {};
            products.forEach(p => {
                categoryMap[p.category] = (categoryMap[p.category] || 0) + 1;
            });
            const categoryChartData = Object.keys(categoryMap).map(key => ({
                name: key,
                value: categoryMap[key]
            }));

            setStats({ totalProducts, lowStock, totalItems });
            setCategoryData(categoryChartData);

            // Fetch Asset Status for Overview Chart
            const assetsSnapshot = await getDocs(collection(db, 'assets'));
            const assets = assetsSnapshot.docs.map(doc => doc.data());

            if (assets) {
                const inStock = assets.filter(a => a.status === 'in_stock').length;
                const inUse = assets.filter(a => a.status === 'in_use').length;
                setAssetStatus([
                    { name: 'พร้อมใช้งาน', value: inStock, fill: '#10B981' },
                    { name: 'ถูกยืม', value: inUse, fill: '#F59E0B' }
                ]);
            }

            // 2. Fetch Transactions for Top Movers, Trend, Monthly, Heatmap
            // Fetch ALL transactions (assuming dataset size is reasonable for dashboard, e.g. < 2000)
            // If dataset is huge, we should optimize with specific queries, but for now catch-all is fastest migration path.
            // We can optimize with `limit` or `startDate` later.
            // Let's fetch last 12 months minimum.
            const twelveMonthsAgo = subMonths(new Date(), 12);

            const transactionsQ = query(
                collection(db, 'transactions'),
                where('created_at', '>=', twelveMonthsAgo.toISOString()),
                orderBy('created_at', 'asc')
            );

            const txSnapshot = await getDocs(transactionsQ);
            const allTransactions = txSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // --- Process Transactions Data ---

            const movementMap = {};
            const dailyStats = {};
            const monthlyStats = {};
            const heatmap = Array(7).fill().map(() => Array(10).fill(0));

            // Initialize last 7 days for Trend
            for (let i = 0; i < 7; i++) {
                const date = subDays(new Date(), i);
                const dateStr = format(date, 'dd/MM', { locale: th });
                dailyStats[dateStr] = 0;
            }

            // Initialize 12 months
            for (let i = 11; i >= 0; i--) {
                const month = subMonths(new Date(), i);
                const monthKey = format(month, 'MMM yy', { locale: th });
                monthlyStats[monthKey] = { transactions: 0, items: 0 };
            }

            // Iterate Transactions
            allTransactions.forEach(tx => {
                const txDate = parseISO(tx.created_at);
                const items = tx.items || [];
                const totalQty = items.reduce((sum, item) => sum + (item.quantity || item.cartQuantity || 0), 0);

                // 1. Movement & Top 10 (Transactions items logic)
                items.forEach(item => {
                    const pid = item.product_id || item.id; // Fallback IDs
                    // Need product name if not in item? usually embedded now.
                    // If name missing, might need lookup from `products` array we fetched earlier.
                    let name = item.product_name || item.name || 'Unknown';
                    let sku = item.sku || 'N/A';

                    if (name === 'Unknown' || sku === 'N/A') {
                        const pFound = products.find(p => p.id === pid);
                        if (pFound) {
                            name = pFound.name;
                            sku = pFound.sku;
                        }
                    }

                    if (pid) {
                        if (!movementMap[pid]) {
                            movementMap[pid] = { name, sku, count: 0 };
                        }
                        movementMap[pid].count += (item.quantity || item.cartQuantity || 0);
                    }
                });


                // 2. Trend Chart (Last 7 Days)
                const trendDateStr = format(txDate, 'dd/MM', { locale: th });
                // Only count if within last 7 days? 
                // We initialized the keys, so check if key exists (exact logic as before)
                if (Object.hasOwn(dailyStats, trendDateStr)) {
                    dailyStats[trendDateStr] += totalQty;
                }

                // 3. Monthly Comparison
                const monthKey = format(txDate, 'MMM yy', { locale: th });
                if (monthlyStats[monthKey]) {
                    monthlyStats[monthKey].transactions += 1;
                    monthlyStats[monthKey].items += totalQty;
                }

                // 4. Heatmap
                const dayOfWeek = getDay(txDate); // 0 = Sunday
                const hour = getHours(txDate);
                if (hour >= 8 && hour <= 17) {
                    const hourIndex = hour - 8;
                    heatmap[dayOfWeek][hourIndex] += 1;
                }
            });


            // Set State from Processed Data

            // Top Movers (Top 5)
            const sortedMovers = Object.values(movementMap)
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
                .map(m => ({
                    id: m.name, // using name as id for list key if pid missing
                    name: m.name,
                    sku: m.sku,
                    movement: m.count
                }));
            setTopMovers(sortedMovers);

            // Top 10 Products
            const top10 = Object.values(movementMap)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);
            setTop10Products(top10);

            // Trend Data
            const trendChartData = Object.keys(dailyStats).map(date => ({
                date,
                items: dailyStats[date]
            })).reverse();
            setTrendData(trendChartData);

            // Monthly Data
            const monthlyChartData = Object.keys(monthlyStats).map(month => ({
                month,
                transactions: monthlyStats[month].transactions,
                items: monthlyStats[month].items
            }));
            setMonthlyData(monthlyChartData);

            // Heatmap
            setHeatmapData(heatmap);

        } catch (err) {
            console.error('Error fetching dashboard data:', err);
            setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
        } finally {
            setLoading(false);
        }
    };

    const COLORS = ['#1C6CB4', '#ED2229', '#10B981', '#F59E0B', '#8B5CF6'];

    // Show loading skeleton
    if (loading) {
        return <LoadingSkeleton />;
    }

    // Show error state
    if (error) {
        return <ErrorDisplay error={error} onRetry={fetchDashboardData} />;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-[#1C6CB4]/20 rounded-xl">
                    <LayoutDashboard className="text-[#1C6CB4]" size={28} />
                </div>
                <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>แดชบอร์ด</h1>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Products */}
                <div className="glass-card p-6 flex items-center gap-4 group transition-all duration-300 hover:shadow-lg">
                    <div className="p-4 bg-[#1C6CB4]/15 rounded-2xl text-[#1C6CB4] group-hover:scale-110 transition-transform duration-300">
                        <Package size={28} />
                    </div>
                    <div>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>อุปกรณ์ทั้งหมด</p>
                        <h3 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.totalProducts}</h3>
                    </div>
                </div>

                {/* Low Stock Alert */}
                <div className="glass-card p-6 flex items-center gap-4 group transition-all duration-300 hover:shadow-lg">
                    <div className="p-4 bg-[#ED2229]/15 rounded-2xl text-[#ED2229] group-hover:scale-110 transition-transform duration-300">
                        <AlertTriangle size={28} />
                    </div>
                    <div>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>แจ้งเตือนใกล้หมด</p>
                        <h3 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.lowStock}</h3>
                    </div>
                </div>

                {/* Total Items */}
                <div className="glass-card p-6 flex items-center gap-4 group transition-all duration-300 hover:shadow-lg">
                    <div className="p-4 bg-green-500/15 rounded-2xl text-green-600 group-hover:scale-110 transition-transform duration-300">
                        <Activity size={28} />
                    </div>
                    <div>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>จำนวนในคลัง</p>
                        <h3 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.totalItems}</h3>
                    </div>
                </div>
            </div>

            {/* Monthly Comparison Chart (NEW) */}
            {monthlyData.length > 0 && (
                <div className="glass-card p-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Calendar size={20} className="text-[#1C6CB4]" />
                        เปรียบเทียบรายเดือน (12 เดือนล่าสุด)
                    </h2>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.1)" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: '1px solid #E5E7EB',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                        backgroundColor: '#fff'
                                    }}
                                    formatter={(value, name) => [
                                        value,
                                        name === 'transactions' ? 'จำนวนครั้ง' : 'จำนวนชิ้น'
                                    ]}
                                />
                                <Legend
                                    formatter={(value) => value === 'transactions' ? 'จำนวนครั้ง' : 'จำนวนชิ้น'}
                                />
                                <Bar dataKey="transactions" fill="#1C6CB4" radius={[4, 4, 0, 0]} name="transactions" />
                                <Bar dataKey="items" fill="#10B981" radius={[4, 4, 0, 0]} name="items" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Trend Chart (Takes up 2 columns) */}
                <div className="lg:col-span-2 glass-card p-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <ArrowUpRight size={20} className="text-[#1C6CB4]" />
                        แนวโน้มการเบิกจ่าย (7 วันล่าสุด)
                    </h2>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorItems" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#1C6CB4" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#1C6CB4" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.1)" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: '1px solid #E5E7EB',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                        backgroundColor: '#fff'
                                    }}
                                />
                                <Area type="monotone" dataKey="items" stroke="#1C6CB4" strokeWidth={2} fillOpacity={1} fill="url(#colorItems)" name="จำนวนที่เบิก" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Distribution */}
                <div className="glass-card p-6">
                    <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>สัดส่วนหมวดหมู่</h2>
                    <div className="flex flex-col items-center">
                        <div style={{ width: '100%', height: '220px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <defs>
                                        {COLORS.map((color, index) => (
                                            <linearGradient key={`gradient-${index}`} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={color} stopOpacity={1} />
                                                <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <Pie
                                        data={categoryData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={85}
                                        paddingAngle={3}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={`url(#gradient-${index % COLORS.length})`}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '12px',
                                            border: '1px solid #E5E7EB',
                                            backgroundColor: '#fff',
                                            padding: '12px 16px'
                                        }}
                                        formatter={(value, name) => [`${value} รายการ`, name]}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        {/* Custom Legend */}
                        <div className="w-full mt-4 grid grid-cols-2 gap-2">
                            {categoryData.map((entry, index) => (
                                <div key={entry.name} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                    />
                                    <span className="text-sm text-gray-500 truncate">{entry.name}</span>
                                    <span className="text-sm font-medium ml-auto" style={{ color: 'var(--text-primary)' }}>{entry.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Top 10 Products & Heatmap (NEW) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top 10 Products */}
                <div className="glass-card p-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <BarChart3 size={20} className="text-purple-500" />
                        Top 10 สินค้าเบิกบ่อย
                    </h2>
                    {top10Products.length > 0 ? (
                        <div style={{ width: '100%', height: '350px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={top10Products} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.1)" />
                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#6B7280', fontSize: 11 }}
                                        width={120}
                                        tickFormatter={(value) => value.length > 15 ? value.substring(0, 15) + '...' : value}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '12px',
                                            border: '1px solid #E5E7EB',
                                            backgroundColor: '#fff'
                                        }}
                                        formatter={(value) => [`${value} ครั้ง`, 'จำนวนเบิก']}
                                    />
                                    <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]}>
                                        {top10Products.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={index < 3 ? '#8B5CF6' : '#8B5CF6AA'}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-8">ไม่มีข้อมูล</p>
                    )}
                </div>

                {/* Checkout Heatmap */}
                <div className="glass-card p-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Clock size={20} className="text-orange-500" />
                        ช่วงเวลาเบิกจ่าย (Heatmap)
                    </h2>
                    <div className="flex flex-col items-center">
                        <p className="text-sm text-gray-500 mb-4">วิเคราะห์ช่วงเวลาที่มีการเบิกจ่ายบ่อย (08:00-17:00)</p>
                        <CheckoutHeatmap data={heatmapData} />
                    </div>
                </div>
            </div>

            {/* Asset Status Overview */}
            {assetStatus.length > 0 && (
                <div className="glass-card p-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Package size={20} className="text-[#1C6CB4]" />
                        สถานะครุภัณฑ์
                    </h2>
                    <div style={{ width: '100%', height: '200px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={assetStatus} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.1)" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} width={100} />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: '1px solid #E5E7EB',
                                        backgroundColor: '#fff'
                                    }}
                                    formatter={(value) => [`${value} รายการ`]}
                                />
                                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                                    {assetStatus.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Low Stock Alerts */}
                <div className="glass-card p-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <AlertTriangle size={20} className="text-[#ED2229]" />
                        แจ้งเตือนสินค้าใกล้หมด
                    </h2>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {lowStockItems.length > 0 ? (
                            lowStockItems.map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100 hover:bg-red-100/50 transition-colors">
                                    <div>
                                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.name}</h4>
                                        <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-red-600">{item.quantity}</div>
                                        <div className="text-xs text-gray-500">ขั้นต่ำ: {item.min_threshold}</div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-gray-400 flex flex-col items-center">
                                <CheckCircle size={48} className="text-green-500 mb-2 opacity-50" />
                                <p>ไม่มีสินค้าใกล้หมด</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Top Movers */}
                <div className="glass-card p-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <TrendingUp size={20} className="text-green-500" />
                        5 อันดับเคลื่อนไหวสูงสุด
                    </h2>
                    <div className="space-y-3">
                        {topMovers.length > 0 ? (
                            topMovers.map((item, index) => (
                                <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 flex items-center justify-center rounded-xl font-bold text-sm ${index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white shadow-lg shadow-yellow-500/30' :
                                            index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-white' :
                                                index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white' :
                                                    'bg-gray-200 text-gray-600'
                                            }`}>
                                            {index + 1}
                                        </div>
                                        <div>
                                            <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.name}</h4>
                                            <p className="text-sm text-gray-500">{item.sku}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-green-600">
                                        <Activity size={16} />
                                        <span className="font-bold">{item.movement}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-400 text-center py-4">ไม่มีข้อมูลการเคลื่อนไหว</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Main Dashboard component wrapped with Error Boundary
const Dashboard = () => {
    const [key, setKey] = React.useState(0);

    const handleRetry = () => {
        setKey(prev => prev + 1);
    };

    return (
        <DashboardErrorBoundary onRetry={handleRetry}>
            <DashboardContent key={key} />
        </DashboardErrorBoundary>
    );
};

export default Dashboard;

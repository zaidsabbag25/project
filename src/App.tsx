import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AppProvider } from './lib/store';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { Product } from './pages/Product';
import { BlogPage, ArticlePage, ContactPage, PolicyPage, NotFound } from './pages/Content';
import {
  AuthPage,
  AccountPage,
  CartPage,
  CheckoutPage,
  OrdersPage,
  OrderPage,
  WishlistPage,
} from './pages/UserPages';
import { DashboardPage } from './pages/Dashboard';
function CategoryRedirect() {
  const { slug } = useParams();
  return <Navigate to={'/shop?category=' + encodeURIComponent(slug || '')} replace />;
}
export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="shop" element={<Catalog />} />
            <Route path="category/:slug" element={<CategoryRedirect />} />
            <Route path="product/:slug" element={<Product />} />
            <Route path="product" element={<Navigate to="/shop" replace />} />
            <Route path="blog" element={<BlogPage />} />
            <Route path="blog/:slug" element={<ArticlePage />} />
            <Route path="journal" element={<Navigate to="/blog" replace />} />
            <Route
              path="journal/a-considered-home"
              element={<Navigate to="/blog/a-room-to-unwind" replace />}
            />
            <Route path="contact" element={<ContactPage />} />
            <Route path="sign-in" element={<AuthPage mode="login" />} />
            <Route path="sign-up" element={<AuthPage mode="register" />} />
            <Route path="login" element={<Navigate to="/sign-in" replace />} />
            <Route path="register" element={<Navigate to="/sign-up" replace />} />
            <Route path="forgot-password" element={<AuthPage mode="forgot" />} />
            <Route path="reset-password" element={<AuthPage mode="reset" />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderPage />} />
            <Route path="seller" element={<DashboardPage />} />
            <Route path="admin" element={<DashboardPage />} />
            <Route path="privacy" element={<PolicyPage type="privacy" />} />
            <Route path="terms" element={<PolicyPage type="terms" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

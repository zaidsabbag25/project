export interface User {
  id: number;
  name: string;
  email: string;
  role: 'buyer' | 'seller' | 'admin';
  active: boolean;
}
export interface Category {
  id: number;
  name: string;
  slug: string;
}
export interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  categoryId: number;
  category: string;
  categorySlug: string;
  sellerId: number;
  sellerName: string;
  images: string[];
  archived: boolean;
  createdAt: string;
  rating: number;
  reviewCount: number;
}
export interface Address {
  id?: number;
  name: string;
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string;
}
export interface Review {
  id: number;
  productId: number;
  userName: string;
  rating: number;
  body: string;
  verified: boolean;
  approved: boolean;
  createdAt: string;
}
export interface Cart {
  items: { product: Product; quantity: number }[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
}
export interface OrderItem {
  id: number;
  productId: number;
  sellerId: number;
  name: string;
  price: number;
  quantity: number;
  image: string;
  status: string;
}
export interface Order {
  id: number;
  userId?: number;
  buyerName?: string;
  createdAt: string;
  status: string;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  address: Address;
  shippingMethod: string;
  paymentMode: 'demo';
  items: OrderItem[];
}

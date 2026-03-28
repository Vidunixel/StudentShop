import { Injectable } from '@angular/core';
import {User as NativeUser} from "./models/User";
import {DatabaseService} from "./database.service";
import {AuthenticationService} from "./authentication.service";
import {Note} from "./models/Note";
import {BehaviorSubject, Observable} from "rxjs";
import {DialogsService} from "./dialog-components/dialogs.service";
import AsyncLock from "async-lock";

@Injectable({
  providedIn: 'root'
})
export class UserCartService {

  nativeUser: NativeUser | null | undefined = undefined;
  cart: { _index: string, _id: string }[] = [];
  lock: AsyncLock = new AsyncLock();

  detailedCart: BehaviorSubject<Note[]> = new BehaviorSubject<Note[]>([]);

  constructor(private db: DatabaseService, private authenticationService: AuthenticationService,
              private dialogsService: DialogsService) {
    this.authenticationService.getNativeUser().subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      // Get localCart
      let localCart = this.#getLocalCart();
      // If localCart doesn't exist, initialise an empty array.
      if (!localCart) {
        localCart = this.#initialiseLocalCart();
      }

      // Set session cart to user's account cart if logged in.
      if (nativeUser) {
        const response = await this.db.getCart(await this.authenticationService.getUserIdToken());
        if (Array.isArray(response?.cartItems)) {
          this.cart = response.cartItems;
        }
      } else {
        // Set session cart to localCart.
        this.cart = localCart;
      }

      // Upload cart to user's account if local cart contains more than 1 item.
      if (localCart?.length && nativeUser) {
        await this.syncCart();
      }

      await this.#initialiseDetailedCart();
    });
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  // Method that returns true if two cartItem objects are similar.
  isDuplicateCartItem(object1: { _index: string, _id: string }, object2: { _index: string, _id: string }): boolean {
    if (!object1 || !object2) return false; // Ensure both objects are valid.

    return (
      (object1._index?.toLowerCase() === object2._index?.toLowerCase()) &&
      (object1._id?.toLowerCase() === object2._id?.toLowerCase())
    )
  }

  // Upload local cart to account and delete local cart.
  async syncCart() {
    try {
      let localCart: { _index: string, _id: string }[] = this.#getLocalCart();
      const accountCart: { _index: string, _id: string }[] = [...this.cart];

      // Filter out duplicates based on cartItem attributes.
      localCart = localCart
        .filter((localCartItem: { _index: string, _id: string }) => !accountCart.some(accountCartItem =>
          this.isDuplicateCartItem(localCartItem, accountCartItem)));

      accountCart.push(...localCart);

      // Upload cart.
      const response = await this.db.updateCart(await this.authenticationService.getUserIdToken(), { cartItems: accountCart });
      if (this.nativeUser && Array.isArray(response?.cartItems)) {
        this.cart = response.cartItems; // Update cart to db cart.
      }
    } catch (error) {
      console.log(error);
    }

    // Set to an empty array (Delete local cartItems).
    this.#initialiseLocalCart();
  }

  #initialiseLocalCart() {
    localStorage.setItem("cart", JSON.stringify([]));
    return [];
  }

  #getLocalCart() {
    return JSON.parse(localStorage.getItem("cart") || "null");
  }

  async #initialiseDetailedCart(): Promise<void> {
    const cart: { _index: string, _id: string }[] = this.cart;
    let detailedCart: Note[] = [];

    for (let i: number = 0; i < cart.length; i++) {
      // Try to get detailed cart item.
      try {
        const detailedItem: Note = await this.#serveDetailedCartItem(cart[i]);
        detailedCart.push(detailedItem);
      } catch (error: any) {
        console.log(error);
      }
    }

    // Set detailedCart.
    this.detailedCart.next(detailedCart);
  }

  getCart(): { _index: string, _id: string }[] {
    return this.cart;
  }

  async setCart(cart: { _index: string, _id: string }[]) {
    if (this.nativeUser) {
      const response = await this.db.updateCart(await this.authenticationService.getUserIdToken(), { cartItems: cart });
      if (!Array.isArray(response?.cartItems)) {
        throw new Error();
      }
      // Replace original cart array with new one without replacing array reference.
      this.cart.length = 0; // Clear existing array.
      this.cart.push(...response.cartItems); // Add new elements.
    } else {
      localStorage.setItem("cart", JSON.stringify(cart));
      let localCart = this.#getLocalCart();
      if (!Array.isArray(localCart)) {
        throw new Error();
      }
      // Replace original cart array with new one without replacing array reference.
      this.cart.length = 0;
      this.cart.push(...localCart);
    }
  }

  getDetailedCart(): Observable<Note[]> {
    return this.detailedCart.asObservable();
  }

  getCartSubtotal(): number {
    let subtotal: number = 0;
    for (const detailedCartItem of this.detailedCart.value) {
      subtotal += detailedCartItem.price;
    }

    return subtotal;
  }

  // Returns true if item is in cart, else false.
  isItemInCart(cartItem: { _index: string, _id: string }): boolean {
    return this.cart.some((userCartItem: { _index: string, _id: string }) =>
      this.isDuplicateCartItem(cartItem, userCartItem));
  }

  async addCartItem(cartItem: { _index: string, _id: string }): Promise<{ _index: string; _id: string } | void> {
    try {
      // Lock requests with the same item to run synchronously.
      await this.lock.acquire(`${cartItem._index}:${cartItem._id}`, async () => {
        let cart: { _index: string, _id: string }[] = [...this.cart]; // Get cart copy.

        if (cart.length < 50) {

          // Only push cartItem if it doesn't already exist.
          if (!this.isItemInCart(cartItem)) {

            // Update cart & detailedCart.
            cart.push(cartItem);
            await this.setCart(cart);

            // Get detailedItem from database and add detailedItem to detailedCart list.
            const detailedItem: Note = await this.#serveDetailedCartItem(cartItem);
            const detailedCart: Note[] = [...(this.detailedCart.value), detailedItem];
            this.detailedCart.next(detailedCart);
          }

          return cartItem;
        } else {
          throw new Error("Maximum number of cart items reached.", { cause: { status: 400 }});
        }
      });
    } catch (error: any) {
      console.log(error);
      this.dialogsService.displayErrorDialog("Cart could not be updated.", error);
    }
  }

  async removeCartItem(cartItemToRemove: { _index: string, _id: string }): Promise<void> {
    try {
      // Lock requests with the same item to run synchronously.
      await this.lock.acquire(`${cartItemToRemove._index}:${cartItemToRemove._id}`, async () => {
        let cart: { _index: string, _id: string }[] = [...this.cart]; // Get cart copy.

        // Remove cartItemToRemove from cart.
        cart = cart.filter((cartItem: { _index: string, _id: string }) =>
          !(cartItemToRemove._index === cartItem._index && cartItemToRemove._id === cartItem._id));

        // Update cart & detailedCart.
        await this.setCart(cart);

        // Remove cartItemToRemove from detailedCart list.
        const detailedCart: Note[] = this.detailedCart.value.filter(detailedCartItem =>
          !(cartItemToRemove._index === detailedCartItem._index && cartItemToRemove._id === detailedCartItem._id));
        this.detailedCart.next(detailedCart);

        return;
      });
    } catch (error: any) {
      console.log(error);
      this.dialogsService.displayErrorDialog("Cart could not be updated.", error);
    }
  }

  async #serveDetailedCartItem(cartItem: { _index: string, _id: string }) {
    switch (cartItem._index) {
      case ("notes"):
        const response = await this.db.getNote(cartItem._id);
        const note = response.note;

        if (note.status !== Note.NoteStatus.LISTED || note.sellerUid === this.nativeUser?.uid) {
          throw new Error("Cart contains items not for sale.", { cause: { status: 400 }});
        } else if (note.isPurchased) {
          throw new Error("Cart contains already purchased items.", { cause: { status: 400 }});
        }

        return note;
    }
  }
}

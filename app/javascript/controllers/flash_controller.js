import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
    connect() {
        this.timeout = setTimeout(() => {
            this.dismiss()
        }, 3000)
    }

    dismiss() {
        this.element.classList.add("transition-all", "duration-500", "opacity-0", "transform", "-translate-y-4")
        setTimeout(() => {
            this.element.remove()
        }, 500)
    }

    disconnect() {
        if (this.timeout) {
            clearTimeout(this.timeout)
        }
    }
}

import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
    static targets = [
        "gameClock", "shotClock",
        "homeScore", "awayScore",
        "homeFouls", "awayFouls",
        "homeTimeouts", "awayTimeouts"
    ]

    connect() {
        this.timeRemaining = 600 // 10:00
        this.timerRunning = false
        this.shotClock = 24
        console.log("Scoreboard controller connected!")
    }

    startTimer() {
        if (this.timerRunning) return
        this.timerRunning = true
        this.timerInterval = setInterval(() => {
            this.tick()
        }, 1000)
    }

    pauseTimer() {
        this.timerRunning = false
        clearInterval(this.timerInterval)
    }

    resetTimer() {
        this.pauseTimer()
        this.timeRemaining = 600
        this.render()
    }

    resetShotClock(event) {
        const seconds = parseInt(event.currentTarget.dataset.seconds)
        this.shotClock = seconds
        this.updateShotClockDisplay()
    }

    updateScore(event) {
        const team = event.currentTarget.dataset.team // 'home' or 'away'
        const points = parseInt(event.currentTarget.dataset.points)

        if (team === 'home') {
            const current = parseInt(this.homeScoreTarget.innerText)
            this.homeScoreTarget.innerText = limit(current + points)
        } else {
            const current = parseInt(this.awayScoreTarget.innerText)
            this.awayScoreTarget.innerText = limit(current + points)
        }
    }

    updateFouls(event) {
        const team = event.currentTarget.dataset.team
        const change = parseInt(event.currentTarget.dataset.change)

        const target = team === 'home' ? this.homeFoulsTarget : this.awayFoulsTarget
        let current = parseInt(target.innerText)
        target.innerText = Math.max(0, current + change)
    }

    tick() {
        if (this.timeRemaining > 0) {
            this.timeRemaining--
            if (this.shotClock > 0) this.shotClock--
            this.render()
        } else {
            this.pauseTimer()
        }
    }

    render() {
        const minutes = Math.floor(this.timeRemaining / 60)
        const seconds = this.timeRemaining % 60
        this.gameClockTarget.innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`
        this.updateShotClockDisplay()
    }

    updateShotClockDisplay() {
        if (this.hasShotClockTarget) {
            this.shotClockTarget.innerText = this.shotClock
        }
    }
}

function limit(val) {
    return Math.max(0, val)
}

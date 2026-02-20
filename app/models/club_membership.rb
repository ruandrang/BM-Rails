class ClubMembership < ApplicationRecord
  ROLES = %w[owner admin member].freeze

  belongs_to :user
  belongs_to :club
  validates :role, presence: true, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :club_id }

  scope :owners, -> { where(role: "owner") }
  scope :admins, -> { where(role: %w[owner admin]) }
  scope :members_only, -> { where(role: "member") }

  def owner?
    role == "owner"
  end

  def admin?
    role.in?(%w[owner admin])
  end

  def member?
    role == "member"
  end
end

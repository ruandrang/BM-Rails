class Identity < ApplicationRecord
  PROVIDERS = %w[kakao naver google_oauth2].freeze

  belongs_to :user

  validates :provider, presence: true, inclusion: { in: PROVIDERS }
  validates :uid, presence: true, uniqueness: { scope: :provider }
  validates :user_id, uniqueness: { scope: :provider }
end

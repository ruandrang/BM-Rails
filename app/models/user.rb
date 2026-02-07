class User < ApplicationRecord
  has_secure_password

  has_many :clubs, dependent: :destroy

  validates :name, presence: true
  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 6 }, on: :create
  validates :password, length: { minimum: 6 }, allow_nil: true, on: :update

  before_validation { self.email = email.to_s.downcase.strip }

  def admin?
    admin
  end
end

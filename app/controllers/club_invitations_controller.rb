class ClubInvitationsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_admin, only: [ :create, :destroy ]

  def index
    @invitations = @club.club_invitations.order(created_at: :desc)
  end

  def create
    @invitation = @club.club_invitations.new(invitation_params)
    @invitation.created_by = current_user
    if @invitation.save
      redirect_to club_invitations_path(@club), notice: "초대 코드가 생성되었습니다."
    else
      @invitations = @club.club_invitations.order(created_at: :desc)
      render :index, status: :unprocessable_entity
    end
  end

  def destroy
    @invitation = @club.club_invitations.find(params[:id])
    @invitation.destroy
    redirect_to club_invitations_path(@club), notice: "초대 코드가 삭제되었습니다."
  end

  private

  def invitation_params
    params.require(:club_invitation).permit(:expires_at, :max_uses)
  end
end
